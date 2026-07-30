import { createHmac } from "node:crypto";

const DEFAULT_STUN_SERVER = { urls: "stun:stun.l.google.com:19302" };
const TURN_CREDENTIAL_LIFETIME_SECONDS = 2 * 60 * 60;
const METERED_CREDENTIAL_CACHE = new Map();

const asUrlList = (value) => String(value || "")
  .split(",")
  .map((url) => url.trim())
  .filter((url) => /^(stun|turn|turns):/i.test(url));

const parseStaticIceServers = () => {
  try {
    const parsed = JSON.parse(process.env.WATCH_TOGETHER_ICE_SERVERS || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((server) => {
        const urls = Array.isArray(server?.urls) ? server.urls.filter((url) => /^(stun|turn|turns):/i.test(url)) : server?.urls;
        if (!urls || (Array.isArray(urls) && !urls.length)) return null;
        return {
          urls,
          ...(server.username ? { username: String(server.username) } : {}),
          ...(server.credential ? { credential: String(server.credential) } : {}),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const getTurnServer = (userId) => {
  const urls = asUrlList(process.env.WATCH_TOGETHER_TURN_URLS || process.env.TURN_URLS);
  const secret = String(process.env.WATCH_TOGETHER_TURN_SHARED_SECRET || process.env.TURN_SHARED_SECRET || "");
  if (!urls.length || !secret) return null;

  const safeUserId = String(userId || "viewer").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) || "viewer";
  const username = `${Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_LIFETIME_SECONDS}:${safeUserId}`;
  const credential = createHmac("sha1", secret).update(username).digest("base64");
  return { urls, username, credential, credentialType: "password" };
};

const hasTurnUrl = (server) => {
  const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
  return urls.some((url) => /^turns?:/i.test(String(url || "")));
};

const getMeteredTurnServers = async (userId) => {
  const domain = String(process.env.METERED_TURN_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
  const secretKey = String(process.env.METERED_TURN_SECRET_KEY || "").trim();
  if (!/^[A-Za-z0-9.-]+$/.test(domain) || !secretKey) return [];

  const safeUserId = String(userId || "viewer").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "viewer";
  const lifetime = Math.min(
    Math.max(Number(process.env.METERED_TURN_CREDENTIAL_TTL_SECONDS) || TURN_CREDENTIAL_LIFETIME_SECONDS, 300),
    14_400,
  );
  const cached = METERED_CREDENTIAL_CACHE.get(safeUserId);
  if (cached?.expiresAt > Date.now() + 60_000) return cached.iceServers;

  try {
    const createUrl = new URL(`https://${domain}/api/v1/turn/credential`);
    createUrl.searchParams.set("secretKey", secretKey);
    const credentialResponse = await fetch(createUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiryInSeconds: lifetime, label: `watch-${safeUserId}` }),
    });
    if (!credentialResponse.ok) throw new Error(`credential request returned ${credentialResponse.status}`);
    const credential = await credentialResponse.json();
    if (!credential?.apiKey) throw new Error("credential API key was missing");

    const serversUrl = new URL(`https://${domain}/api/v1/turn/credentials`);
    serversUrl.searchParams.set("apiKey", credential.apiKey);
    const serversResponse = await fetch(serversUrl);
    if (!serversResponse.ok) throw new Error(`ICE server request returned ${serversResponse.status}`);
    const iceServers = await serversResponse.json();
    if (!Array.isArray(iceServers) || !iceServers.some(hasTurnUrl)) throw new Error("no TURN servers were returned");

    METERED_CREDENTIAL_CACHE.set(safeUserId, {
      iceServers,
      expiresAt: Date.now() + Math.max(60_000, lifetime * 1000 - 60_000),
    });
    return iceServers;
  } catch (error) {
    console.error("Watch Together Metered TURN credentials failed:", error.message);
    return [];
  }
};

export const getWatchTogetherIceServers = async (req, res) => {
  const userId = req.auth?.().userId;
  const turnServer = getTurnServer(userId);
  const meteredTurnServers = turnServer ? [] : await getMeteredTurnServers(userId);
  const staticServers = parseStaticIceServers();
  const stunUrls = asUrlList(process.env.WATCH_TOGETHER_STUN_URLS);
  const iceServers = [
    ...(stunUrls.length ? [{ urls: stunUrls }] : [DEFAULT_STUN_SERVER]),
    ...staticServers,
    ...meteredTurnServers,
    ...(turnServer ? [turnServer] : []),
  ];

  return res.json({
    success: true,
    iceServers,
    relayConfigured: Boolean(turnServer || meteredTurnServers.some(hasTurnUrl) || staticServers.some(hasTurnUrl)),
  });
};

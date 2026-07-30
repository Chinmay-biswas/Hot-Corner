import { randomUUID } from "node:crypto";
import { verifyToken } from "@clerk/express";
import WatchRoom from "../models/WatchRoom.js";
import { createRoomRealtimeState } from "../services/roomRealtimeState.js";
import {
  cleanDisplayName,
  cleanImageUrl,
  createValidationError,
  normalizeMedia,
  normalizePlayback,
  normalizeRoomCode,
} from "../utils/roomUtils.js";
import { canControlRoom, isRoomHost, presentWatchRoom } from "../utils/roomPresenter.js";
import { getCompletedR2Media } from "../services/r2Storage.js";

const participantLeaveTimers = new Map();
const DEFAULT_PRESENCE_GRACE_MS = 12_000;
const roomKey = (code) => `watch-room:${code}`;

const respond = (acknowledgement, payload) => {
  if (typeof acknowledgement === "function") acknowledgement(payload);
};

const toSocketError = (message) => ({ ok: false, error: message });

const findActiveRoom = async (roomCode) => {
  const code = normalizeRoomCode(roomCode);
  if (!code) throw createValidationError("Room code is required.");

  const room = await WatchRoom.findOne({ code, expiresAt: { $gt: new Date() } });
  if (!room) {
    const error = new Error("This room does not exist or has expired.");
    error.statusCode = 404;
    throw error;
  }
  return room;
};

const clearParticipantLeaveTimer = (socketId) => {
  const timer = participantLeaveTimers.get(socketId);
  if (timer) clearTimeout(timer);
  participantLeaveTimers.delete(socketId);
};

const listParticipants = async (state, room) => {
  const byUser = new Map();
  const members = await state.listParticipants(room.code);

  for (const participant of members) {
    const existing = byUser.get(participant.userId);
    const shouldReplace = !existing
      || (participant.connected && !existing.connected)
      || Number(participant.lastSeen || 0) > Number(existing.lastSeen || 0);
    if (shouldReplace) byUser.set(participant.userId, participant);
  }

  return [...byUser.values()].map((participant) => ({
    userId: participant.userId,
    socketId: participant.socketId,
    name: participant.name,
    image: participant.image,
    isHost: isRoomHost(room, participant.userId),
    canControl: canControlRoom(room, participant.userId),
  }));
};

const broadcastParticipants = async (io, state, room) => {
  io.to(roomKey(room.code)).emit("watch:participants", await listParticipants(state, room));
};

const broadcastCallState = async (io, state, roomCode) => {
  const socketIds = await state.listCallParticipants(roomCode);
  io.to(roomKey(roomCode)).emit("watch:call-state", {
    active: Boolean(socketIds.length),
    socketIds,
  });
};

const broadcastRoomState = async (io, state, roomCode) => {
  try {
    const room = await findActiveRoom(roomCode);
    await Promise.all([
      broadcastParticipants(io, state, room),
      broadcastCallState(io, state, room.code),
    ]);
  } catch {
    // The room can expire while a socket is moving between rooms.
  }
};

const removeSocketFromRoom = async (socket, state) => {
  const code = socket.data.roomCode;
  if (!code) return "";

  clearParticipantLeaveTimer(socket.id);
  await Promise.all([
    state.removeParticipant(code, socket.id),
    state.leaveCall(code, socket.id),
  ]);
  socket.data.roomCode = null;
  socket.data.inCall = false;
  return code;
};

const scheduleParticipantLeave = (io, state, code, socketId, presenceGraceMs) => {
  const removeAndBroadcast = async () => {
    participantLeaveTimers.delete(socketId);
    await state.removeParticipant(code, socketId);
    await broadcastRoomState(io, state, code);
  };

  if (presenceGraceMs <= 0) {
    void removeAndBroadcast();
    return;
  }

  const timer = setTimeout(() => { void removeAndBroadcast(); }, presenceGraceMs);
  participantLeaveTimers.set(socketId, timer);
};

const ensureJoinedRoom = async (socket) => {
  if (!socket.data.roomCode) throw createValidationError("Join a room before using its controls.");
  return findActiveRoom(socket.data.roomCode);
};

export const initializeWatchTogetherSocket = (
  io,
  {
    verifyTokenFn = verifyToken,
    presenceGraceMs = DEFAULT_PRESENCE_GRACE_MS,
    realtimeState,
  } = {},
) => {
  const reconnectGraceMs = Math.max(0, Number(presenceGraceMs) || 0);
  const state = realtimeState || createRoomRealtimeState();

  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("Authentication is required."));

    try {
      const claims = await verifyTokenFn(token, { secretKey: process.env.CLERK_SECRET_KEY });
      if (!claims?.sub) throw new Error("Authentication is required.");
      socket.data.userId = claims.sub;
      return next();
    } catch {
      return next(new Error("Authentication is required."));
    }
  });

  io.on("connection", (socket) => {
    socket.data.inCall = false;

    socket.on("watch:join", async (payload = {}, acknowledgement) => {
      try {
        const room = await findActiveRoom(payload.roomCode);
        const previousCode = socket.data.roomCode;
        if (previousCode) {
          socket.leave(roomKey(previousCode));
          await removeSocketFromRoom(socket, state);
          await broadcastRoomState(io, state, previousCode);
        }

        socket.join(roomKey(room.code));
        const participant = {
          userId: socket.data.userId,
          socketId: socket.id,
          name: cleanDisplayName(payload.displayName, "Movie fan"),
          image: cleanImageUrl(payload.image),
        };
        socket.data.roomCode = room.code;
        socket.data.profile = participant;
        await state.upsertParticipant(room.code, participant);

        const participants = await listParticipants(state, room);
        const callSocketIds = await state.listCallParticipants(room.code);
        io.to(roomKey(room.code)).emit("watch:participants", participants);
        socket.emit("watch:room-ready", { roomCode: room.code });
        return respond(acknowledgement, {
          ok: true,
          room: presentWatchRoom(room, socket.data.userId),
          participants,
          callActive: Boolean(callSocketIds.length),
        });
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not join this room."));
      }
    });

    socket.on("watch:presence-heartbeat", async () => {
      if (!socket.data.roomCode) return;
      await state.touch(socket.data.roomCode, socket.id);
    });

    socket.on("watch:playback", async (payload = {}, acknowledgement) => {
      try {
        const room = await ensureJoinedRoom(socket);
        if (!isRoomHost(room, socket.data.userId)) {
          return respond(acknowledgement, toSocketError("Only the room creator can change playback."));
        }

        room.playback = normalizePlayback(payload);
        await room.save();
        const presentedRoom = presentWatchRoom(room, socket.data.userId);
        const event = {
          playback: presentedRoom.playback,
          forceSync: Boolean(payload.forceSync),
          serverNow: presentedRoom.serverNow,
          updatedBy: socket.data.profile,
        };
        io.to(roomKey(room.code)).emit("watch:playback", event);
        return respond(acknowledgement, { ok: true, ...event });
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not update playback."));
      }
    });

    socket.on("watch:media", async (payload = {}, acknowledgement) => {
      try {
        const room = await ensureJoinedRoom(socket);
        if (!isRoomHost(room, socket.data.userId)) {
          return respond(acknowledgement, toSocketError("Only the room creator can change the video."));
        }

        const mediaInput = String(payload.media?.source || "").toLowerCase() === "r2"
          ? await getCompletedR2Media({
            ownerId: socket.data.userId,
            uploadId: payload.media?.r2UploadId,
            title: payload.media?.title,
          })
          : payload.media;
        room.media = normalizeMedia(mediaInput);
        room.playback = { isPlaying: false, currentTime: 0, updatedAt: new Date() };
        await room.save();
        const event = { room: presentWatchRoom(room, socket.data.userId), updatedBy: socket.data.profile };
        io.to(roomKey(room.code)).emit("watch:media", event);
        return respond(acknowledgement, { ok: true, ...event });
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not change the video."));
      }
    });

    socket.on("watch:controller", async (_payload = {}, acknowledgement) => {
      try {
        const room = await ensureJoinedRoom(socket);
        if (!isRoomHost(room, socket.data.userId)) {
          return respond(acknowledgement, toSocketError("Only the room creator can manage controllers."));
        }

        return respond(acknowledgement, toSocketError("Shared controls are disabled. Only the room creator controls playback."));
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not update the controller."));
      }
    });

    socket.on("watch:chat", async (payload = {}, acknowledgement) => {
      try {
        const room = await ensureJoinedRoom(socket);
        const text = String(payload.text || "").trim().replace(/\s+/g, " ").slice(0, 500);
        if (!text) return respond(acknowledgement, toSocketError("Write a message before sending it."));

        const message = {
          id: randomUUID(),
          userId: socket.data.userId,
          name: socket.data.profile?.name || "Movie fan",
          image: socket.data.profile?.image || "",
          text,
          sentAt: new Date().toISOString(),
        };
        const writeResult = await WatchRoom.updateOne(
          { _id: room._id, expiresAt: { $gt: new Date() } },
          { $push: { messages: { $each: [message], $slice: -100 } } },
        );
        if (!writeResult.matchedCount) {
          return respond(acknowledgement, toSocketError("This room does not exist or has expired."));
        }
        io.to(roomKey(room.code)).emit("watch:chat", message);
        return respond(acknowledgement, { ok: true, message });
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not send the message."));
      }
    });

    socket.on("watch:call-join", async (_payload, acknowledgement) => {
      try {
        const room = await ensureJoinedRoom(socket);
        socket.data.inCall = true;
        const existingSockets = await state.joinCall(room.code, socket.id);

        socket.to(roomKey(room.code)).emit("watch:call-participant-joined", {
          socketId: socket.id,
          participant: socket.data.profile,
        });
        await broadcastCallState(io, state, room.code);
        return respond(acknowledgement, { ok: true, existingSockets });
      } catch (error) {
        socket.data.inCall = false;
        return respond(acknowledgement, toSocketError(error.message || "Could not join the call."));
      }
    });

    socket.on("watch:call-leave", async (_payload, acknowledgement) => {
      const code = socket.data.roomCode;
      if (!code) return respond(acknowledgement, { ok: true });

      const wasInCall = socket.data.inCall;
      socket.data.inCall = false;
      await state.leaveCall(code, socket.id);
      if (wasInCall) io.to(roomKey(code)).emit("watch:call-participant-left", { socketId: socket.id });
      await broadcastCallState(io, state, code);
      return respond(acknowledgement, { ok: true });
    });

    socket.on("watch:webrtc-signal", async (payload = {}, acknowledgement) => {
      const code = socket.data.roomCode;
      const targetSocketId = String(payload.to || "");
      const signalType = String(payload.signal?.type || "");
      if (!code || !targetSocketId || !["offer", "answer", "candidate"].includes(signalType)) {
        return respond(acknowledgement, toSocketError("That call signal is invalid."));
      }

      const activeCall = await state.listCallParticipants(code);
      if (!activeCall.includes(socket.id) || !activeCall.includes(targetSocketId)) {
        return respond(acknowledgement, toSocketError("That call participant is no longer available."));
      }

      io.to(targetSocketId).emit("watch:webrtc-signal", {
        from: socket.id,
        participant: socket.data.profile,
        signal: payload.signal,
      });
      return respond(acknowledgement, { ok: true });
    });

    socket.on("disconnect", () => {
      const code = socket.data.roomCode;
      if (!code) return;

      const wasInCall = socket.data.inCall;
      socket.data.roomCode = null;
      socket.data.inCall = false;
      void (async () => {
        await state.leaveCall(code, socket.id);
        await state.markParticipantDisconnected(code, socket.id, reconnectGraceMs);
        if (wasInCall) io.to(roomKey(code)).emit("watch:call-participant-left", { socketId: socket.id });
        await broadcastCallState(io, state, code);
        scheduleParticipantLeave(io, state, code, socket.id, reconnectGraceMs);
      })();
    });
  });
};

export const MAX_GOOGLE_DRIVE_FILE_SIZE = 5 * 1024 * 1024 * 1024;

export const extractYouTubeId = (value) => {
  const raw = String(value || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;

  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    let id = "";

    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      id = url.searchParams.get("v") || "";
      if (!id) {
        const parts = url.pathname.split("/").filter(Boolean);
        if (["embed", "shorts", "live"].includes(parts[0])) id = parts[1] || "";
      }
    }

    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
};

export const formatBytes = (bytes) => {
  const value = Number(bytes || 0);
  if (!value) return "Unknown size";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};

export const toDriveMedia = (file) => ({
  source: "drive",
  driveFileId: file.id,
  title: file.name,
  url: file.webContentLink || `https://drive.google.com/uc?export=download&id=${file.id}`,
  thumbnail: file.thumbnailLink || "",
  mimeType: file.mimeType || "",
});

export const getPlaybackTime = (playback) => {
  if (!playback) return 0;
  const baseTime = Number(playback.currentTime || 0);
  if (!playback.isPlaying || !playback.updatedAt) return baseTime;

  const elapsedSeconds = Math.max(0, (Date.now() - new Date(playback.updatedAt).getTime()) / 1000);
  return baseTime + elapsedSeconds;
};

export const formatPlaybackTime = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  const paddedMinutes = String(minutes).padStart(hours ? 2 : 1, "0");
  const paddedSeconds = String(remainingSeconds).padStart(2, "0");
  return hours ? `${hours}:${paddedMinutes}:${paddedSeconds}` : `${paddedMinutes}:${paddedSeconds}`;
};

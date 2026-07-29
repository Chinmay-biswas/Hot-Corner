export const isRoomHost = (room, userId) => room.hostId === userId;

export const canControlRoom = (room, userId) => isRoomHost(room, userId)
  || (room.controllers || []).includes(userId);

export const presentWatchRoom = (room, userId) => ({
  id: room._id.toString(),
  code: room.code,
  host: {
    id: room.hostId,
    name: room.hostName,
    image: room.hostImage || "",
  },
  media: room.media,
  playback: {
    isPlaying: Boolean(room.playback?.isPlaying),
    currentTime: Number(room.playback?.currentTime || 0),
    updatedAt: room.playback?.updatedAt?.toISOString?.() || new Date().toISOString(),
  },
  expiresAt: room.expiresAt.toISOString(),
  isHost: isRoomHost(room, userId),
  canControl: canControlRoom(room, userId),
});

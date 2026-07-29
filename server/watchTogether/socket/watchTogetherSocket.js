import { randomUUID } from "node:crypto";
import { verifyToken } from "@clerk/express";
import WatchRoom from "../models/WatchRoom.js";
import {
  cleanDisplayName,
  cleanImageUrl,
  createValidationError,
  normalizeMedia,
  normalizePlayback,
  normalizeRoomCode,
} from "../utils/roomUtils.js";
import { canControlRoom, isRoomHost, presentWatchRoom } from "../utils/roomPresenter.js";

const activeParticipants = new Map();
const callParticipants = new Map();
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

const removeSocketFromRoom = (socket) => {
  const code = socket.data.roomCode;
  if (!code) return;

  const roomMembers = activeParticipants.get(code);
  roomMembers?.delete(socket.id);
  if (roomMembers?.size === 0) activeParticipants.delete(code);

  const activeCall = callParticipants.get(code);
  activeCall?.delete(socket.id);
  if (activeCall?.size === 0) callParticipants.delete(code);

  socket.data.roomCode = null;
};

const listParticipants = (room) => {
  const members = activeParticipants.get(room.code) || new Map();
  const byUser = new Map();

  for (const participant of members.values()) {
    if (!byUser.has(participant.userId)) {
      byUser.set(participant.userId, {
        ...participant,
        isHost: isRoomHost(room, participant.userId),
        canControl: canControlRoom(room, participant.userId),
      });
    }
  }

  return [...byUser.values()];
};

const broadcastParticipants = (io, room) => {
  io.to(roomKey(room.code)).emit("watch:participants", listParticipants(room));
};

const callState = (roomCode) => [...(callParticipants.get(roomCode) || new Set())];

const ensureJoinedRoom = async (socket) => {
  if (!socket.data.roomCode) throw createValidationError("Join a room before using its controls.");
  return findActiveRoom(socket.data.roomCode);
};

export const initializeWatchTogetherSocket = (io, { verifyTokenFn = verifyToken } = {}) => {
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
    socket.on("watch:join", async (payload = {}, acknowledgement) => {
      try {
        const room = await findActiveRoom(payload.roomCode);
        if (socket.data.roomCode) socket.leave(roomKey(socket.data.roomCode));
        removeSocketFromRoom(socket);
        socket.join(roomKey(room.code));

        const participant = {
          userId: socket.data.userId,
          socketId: socket.id,
          name: cleanDisplayName(payload.displayName, "Movie fan"),
          image: cleanImageUrl(payload.image),
        };
        socket.data.roomCode = room.code;
        socket.data.profile = participant;
        if (!activeParticipants.has(room.code)) activeParticipants.set(room.code, new Map());
        activeParticipants.get(room.code).set(socket.id, participant);

        broadcastParticipants(io, room);
        return respond(acknowledgement, {
          ok: true,
          room: presentWatchRoom(room, socket.data.userId),
          participants: listParticipants(room),
          callActive: Boolean(callParticipants.get(room.code)?.size),
        });
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not join this room."));
      }
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

        room.media = normalizeMedia(payload.media);
        room.playback = { isPlaying: false, currentTime: 0, updatedAt: new Date() };
        await room.save();
        const event = { room: presentWatchRoom(room, socket.data.userId), updatedBy: socket.data.profile };
        io.to(roomKey(room.code)).emit("watch:media", event);
        return respond(acknowledgement, { ok: true, ...event });
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not change the video."));
      }
    });

    socket.on("watch:controller", async (payload = {}, acknowledgement) => {
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
        if (!callParticipants.has(room.code)) callParticipants.set(room.code, new Set());
        const roomCall = callParticipants.get(room.code);
        const existingSockets = [...roomCall].filter((socketId) => socketId !== socket.id);
        roomCall.add(socket.id);

        socket.to(roomKey(room.code)).emit("watch:call-participant-joined", {
          socketId: socket.id,
          participant: socket.data.profile,
        });
        io.to(roomKey(room.code)).emit("watch:call-state", { active: true, socketIds: callState(room.code) });
        return respond(acknowledgement, { ok: true, existingSockets });
      } catch (error) {
        return respond(acknowledgement, toSocketError(error.message || "Could not join the call."));
      }
    });

    socket.on("watch:call-leave", async (_payload, acknowledgement) => {
      const code = socket.data.roomCode;
      if (!code) return respond(acknowledgement, { ok: true });

      const roomCall = callParticipants.get(code);
      roomCall?.delete(socket.id);
      if (roomCall?.size === 0) callParticipants.delete(code);
      io.to(roomKey(code)).emit("watch:call-participant-left", { socketId: socket.id });
      io.to(roomKey(code)).emit("watch:call-state", {
        active: Boolean(callParticipants.get(code)?.size),
        socketIds: callState(code),
      });
      return respond(acknowledgement, { ok: true });
    });

    socket.on("watch:webrtc-signal", (payload = {}, acknowledgement) => {
      const code = socket.data.roomCode;
      const targetSocketId = String(payload.to || "");
      const activeCall = callParticipants.get(code);
      const targetSocket = io.sockets.sockets.get(targetSocketId);

      if (!code || !targetSocket || !activeCall?.has(socket.id) || !activeCall.has(targetSocketId)) {
        return respond(acknowledgement, toSocketError("That call participant is no longer available."));
      }

      targetSocket.emit("watch:webrtc-signal", {
        from: socket.id,
        participant: socket.data.profile,
        signal: payload.signal,
      });
      return respond(acknowledgement, { ok: true });
    });

    socket.on("disconnect", async () => {
      const code = socket.data.roomCode;
      if (!code) return;

      removeSocketFromRoom(socket);
      socket.to(roomKey(code)).emit("watch:call-participant-left", { socketId: socket.id });
      try {
        const room = await WatchRoom.findOne({ code, expiresAt: { $gt: new Date() } });
        if (room) broadcastParticipants(io, room);
      } catch {
        // The room may have expired while the socket was disconnecting.
      }
      io.to(roomKey(code)).emit("watch:call-state", {
        active: Boolean(callParticipants.get(code)?.size),
        socketIds: callState(code),
      });
    });
  });
};

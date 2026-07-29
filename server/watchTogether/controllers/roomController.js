import User from "../../models/User.js";
import WatchRoom from "../models/WatchRoom.js";
import {
  cleanDisplayName,
  cleanImageUrl,
  createRoomCode,
  createValidationError,
  getRoomExpiryDate,
  normalizeMedia,
  normalizePlayback,
  normalizeRoomCode,
} from "../utils/roomUtils.js";
import { isRoomHost, presentWatchRoom } from "../utils/roomPresenter.js";

const getUserId = (req) => req.auth?.().userId;

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

const getDisplayProfile = async (userId, input = {}) => {
  const savedUser = await User.findById(userId).select("name image").lean();
  return {
    name: cleanDisplayName(input.displayName, savedUser?.name || "Movie fan"),
    image: cleanImageUrl(input.image) || savedUser?.image || "",
  };
};

const sendError = (res, error) => res.status(error.statusCode || 500).json({
  success: false,
  message: error.statusCode ? error.message : "Unable to complete that room action.",
});

export const createWatchRoom = async (req, res) => {
  try {
    const userId = getUserId(req);
    const media = normalizeMedia(req.body.media);
    const profile = await getDisplayProfile(userId, req.body);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const room = new WatchRoom({
        code: createRoomCode(),
        hostId: userId,
        hostName: profile.name,
        hostImage: profile.image,
        controllers: [],
        media,
        playback: { isPlaying: false, currentTime: 0, updatedAt: new Date() },
        expiresAt: getRoomExpiryDate(),
      });

      try {
        await room.save();
        return res.status(201).json({ success: true, room: presentWatchRoom(room, userId) });
      } catch (error) {
        if (error?.code !== 11000 || attempt === 4) throw error;
      }
    }

    throw new Error("Could not create a unique room code.");
  } catch (error) {
    console.error("Watch room creation failed:", error.message);
    return sendError(res, error);
  }
};

export const getWatchRoom = async (req, res) => {
  try {
    const room = await findActiveRoom(req.params.roomCode);
    return res.json({ success: true, room: presentWatchRoom(room, getUserId(req)) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const joinWatchRoom = async (req, res) => {
  try {
    const userId = getUserId(req);
    const room = await findActiveRoom(req.params.roomCode);
    return res.json({
      success: true,
      room: presentWatchRoom(room, userId),
      profile: await getDisplayProfile(userId, req.body),
    });
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateRoomPlayback = async (req, res) => {
  try {
    const userId = getUserId(req);
    const room = await findActiveRoom(req.params.roomCode);
    if (!isRoomHost(room, userId)) {
      const error = new Error("Only the room creator can change playback.");
      error.statusCode = 403;
      throw error;
    }

    room.playback = normalizePlayback(req.body);
    await room.save();
    return res.json({ success: true, room: presentWatchRoom(room, userId) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateRoomMedia = async (req, res) => {
  try {
    const userId = getUserId(req);
    const room = await findActiveRoom(req.params.roomCode);
    if (!isRoomHost(room, userId)) {
      const error = new Error("Only the room creator can change the video.");
      error.statusCode = 403;
      throw error;
    }

    room.media = normalizeMedia(req.body.media);
    room.playback = { isPlaying: false, currentTime: 0, updatedAt: new Date() };
    await room.save();
    return res.json({ success: true, room: presentWatchRoom(room, userId) });
  } catch (error) {
    return sendError(res, error);
  }
};

export const updateRoomController = async (req, res) => {
  try {
    const userId = getUserId(req);
    const room = await findActiveRoom(req.params.roomCode);
    if (!isRoomHost(room, userId)) {
      const error = new Error("Only the room creator can manage controllers.");
      error.statusCode = 403;
      throw error;
    }

    const error = new Error("Shared controls are disabled. Only the room creator controls playback.");
    error.statusCode = 403;
    throw error;
  } catch (error) {
    return sendError(res, error);
  }
};

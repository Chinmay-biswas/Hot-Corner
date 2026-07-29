import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

const getSocketUrl = () => import.meta.env.VITE_BASE_URL || window.location.origin;

const createProfile = (user) => ({
  displayName: user?.fullName || user?.firstName || "Movie fan",
  image: user?.imageUrl || "",
});

const toClientPlayback = (playback, serverNow, forceSync = false) => {
  if (!playback?.updatedAt) return playback;

  const serverTime = new Date(serverNow).getTime();
  const updatedAt = new Date(playback.updatedAt).getTime();
  const clockOffset = Number.isFinite(serverTime) ? serverTime - Date.now() : 0;

  return {
    ...playback,
    updatedAt: Number.isFinite(updatedAt)
      ? new Date(updatedAt - clockOffset).toISOString()
      : playback.updatedAt,
    forceSync: Boolean(forceSync),
  };
};

const toClientRoom = (room) => room ? {
  ...room,
  playback: toClientPlayback(room.playback, room.serverNow),
} : room;

export const useWatchRoom = ({ roomCode, axios, getToken, user }) => {
  const profile = useMemo(() => createProfile(user), [user]);
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("connecting");
  const [callActive, setCallActive] = useState(false);

  const getAuthorization = useCallback(async () => ({
    headers: { Authorization: `Bearer ${await getToken()}` },
  }), [getToken]);

  useEffect(() => {
    if (!roomCode || !user) return undefined;
    let active = true;

    const loadRoom = async () => {
      setIsLoading(true);
      setError("");
      setRoom(null);
      setParticipants([]);
      setMessages([]);
      try {
        const config = await getAuthorization();
        const { data } = await axios.post(
          `/api/watch-together/rooms/${encodeURIComponent(roomCode)}/join`,
          profile,
          config,
        );
        if (!data.success) throw new Error(data.message || "Could not open this room.");
        if (active) setRoom(toClientRoom(data.room));
      } catch (requestError) {
        if (active) setError(requestError.response?.data?.message || requestError.message || "Could not open this room.");
      } finally {
        if (active) setIsLoading(false);
      }
    };

    loadRoom();
    return () => { active = false; };
  }, [axios, getAuthorization, profile, roomCode, user]);

  useEffect(() => {
    if (!roomCode || !user) return undefined;
    let disposed = false;
    let socketInstance;

    const connectSocket = async () => {
      try {
        const token = await getToken();
        if (disposed || !token) return;

        socketInstance = io(getSocketUrl(), {
          autoConnect: false,
          auth: { token },
          transports: ["websocket", "polling"],
        });
        socketRef.current = socketInstance;
        setSocket(socketInstance);

        socketInstance.on("connect", () => {
          setConnectionStatus("connected");
          socketInstance.emit("watch:join", { roomCode, ...profile }, (response) => {
            if (!response?.ok) {
              setError(response?.error || "Could not join the live room.");
              return;
            }
            setRoom(toClientRoom(response.room));
            setParticipants(response.participants || []);
            setCallActive(Boolean(response.callActive));
          });
        });

        socketInstance.on("connect_error", (socketError) => {
          setConnectionStatus("error");
          setError(socketError.message || "The live room could not connect.");
        });
        socketInstance.on("disconnect", () => setConnectionStatus("connecting"));
        socketInstance.on("watch:participants", setParticipants);
        socketInstance.on("watch:chat", (message) => {
          setMessages((current) => [...current.slice(-99), message]);
        });
        socketInstance.on("watch:playback", ({ playback, forceSync, serverNow }) => {
          if (playback) {
            setRoom((current) => current ? {
              ...current,
              playback: toClientPlayback(playback, serverNow, forceSync),
            } : current);
          }
        });
        socketInstance.on("watch:media", ({ room: updatedRoom }) => {
          if (updatedRoom) setRoom(toClientRoom(updatedRoom));
        });
        socketInstance.on("watch:call-state", ({ active }) => setCallActive(Boolean(active)));
        socketInstance.connect();
      } catch (socketError) {
        if (!disposed) {
          setConnectionStatus("error");
          setError(socketError.message || "The live room could not connect.");
        }
      }
    };

    connectSocket();
    return () => {
      disposed = true;
      socketInstance?.disconnect();
      if (socketRef.current === socketInstance) socketRef.current = null;
    };
  }, [getToken, profile, roomCode, user]);

  const emitWithAck = useCallback((event, payload = {}) => new Promise((resolve, reject) => {
    const currentSocket = socketRef.current;
    if (!currentSocket?.connected) {
      reject(new Error("The live room is reconnecting. Please try again in a moment."));
      return;
    }

    currentSocket.timeout(10000).emit(event, payload, (timeoutError, response) => {
      if (timeoutError) {
        reject(new Error("The room did not respond. Please try again."));
        return;
      }
      if (!response?.ok) {
        reject(new Error(response?.error || "That room action could not be completed."));
        return;
      }
      resolve(response);
    });
  }), []);

  const updatePlayback = useCallback(async (playback) => {
    const response = await emitWithAck("watch:playback", playback);
    if (response.playback) {
      setRoom((current) => current ? {
        ...current,
        playback: toClientPlayback(response.playback, response.serverNow, playback.forceSync),
      } : current);
    }
    return response;
  }, [emitWithAck]);

  const updateMedia = useCallback(async (media) => {
    const response = await emitWithAck("watch:media", { media });
    if (response.room) setRoom(toClientRoom(response.room));
    return response;
  }, [emitWithAck]);

  const sendMessage = useCallback(async (text) => emitWithAck("watch:chat", { text }), [emitWithAck]);

  return {
    room,
    participants,
    messages,
    isLoading,
    error,
    connectionStatus,
    callActive,
    socket,
    profile,
    updatePlayback,
    updateMedia,
    sendMessage,
    emitWithAck,
  };
};

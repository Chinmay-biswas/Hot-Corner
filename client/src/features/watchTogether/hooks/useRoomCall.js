import { useCallback, useEffect, useRef, useState } from "react";

const defaultIceServers = [{ urls: "stun:stun.l.google.com:19302" }];

const getIceServers = () => {
  try {
    const configured = import.meta.env.VITE_WATCH_TOGETHER_ICE_SERVERS;
    const servers = configured ? JSON.parse(configured) : null;
    return Array.isArray(servers) && servers.length ? servers : defaultIceServers;
  } catch {
    return defaultIceServers;
  }
};

export const useRoomCall = ({ socket, emitWithAck }) => {
  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const queuedCandidatesRef = useRef(new Map());
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [inCall, setInCall] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [floatingCallVisible, setFloatingCallVisible] = useState(false);
  const [error, setError] = useState("");

  const closePeer = useCallback((socketId) => {
    const peer = peersRef.current.get(socketId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.close();
      peersRef.current.delete(socketId);
    }
    queuedCandidatesRef.current.delete(socketId);
    setRemoteStreams((current) => {
      const next = { ...current };
      delete next[socketId];
      return next;
    });
  }, []);

  const closeAllPeers = useCallback(() => {
    [...peersRef.current.keys()].forEach(closePeer);
  }, [closePeer]);

  const stopLocalStream = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  const flushQueuedCandidates = useCallback(async (socketId, peer) => {
    const candidates = queuedCandidatesRef.current.get(socketId) || [];
    queuedCandidatesRef.current.delete(socketId);
    await Promise.all(candidates.map((candidate) => peer.addIceCandidate(candidate).catch(() => undefined)));
  }, []);

  const createPeer = useCallback((socketId, participant) => {
    const existingPeer = peersRef.current.get(socketId);
    if (existingPeer) return existingPeer;
    if (!localStreamRef.current) throw new Error("Join the call before connecting to other people.");

    const peer = new RTCPeerConnection({ iceServers: getIceServers() });
    peersRef.current.set(socketId, peer);
    localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));

    peer.onicecandidate = ({ candidate }) => {
      if (candidate && socket?.connected) {
        socket.emit("watch:webrtc-signal", { to: socketId, signal: { type: "candidate", candidate } });
      }
    };
    peer.ontrack = ({ streams }) => {
      const stream = streams[0];
      if (!stream) return;
      setRemoteStreams((current) => ({
        ...current,
        [socketId]: { stream, participant: participant || current[socketId]?.participant },
      }));
    };
    peer.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(peer.connectionState)) closePeer(socketId);
    };
    return peer;
  }, [closePeer, socket]);

  const createOffer = useCallback(async (socketId, participant) => {
    const peer = createPeer(socketId, participant);
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    socket?.emit("watch:webrtc-signal", {
      to: socketId,
      signal: { type: "offer", sdp: offer.sdp },
    });
  }, [createPeer, socket]);

  const handleSignal = useCallback(async ({ from, participant, signal }) => {
    if (!signal || !from) return;
    try {
      if (signal.type === "candidate") {
        const peer = peersRef.current.get(from);
        if (!peer || !peer.remoteDescription) {
          const queued = queuedCandidatesRef.current.get(from) || [];
          queued.push(signal.candidate);
          queuedCandidatesRef.current.set(from, queued);
          return;
        }
        await peer.addIceCandidate(signal.candidate);
        return;
      }

      const peer = createPeer(from, participant);
      if (signal.type === "offer") {
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushQueuedCandidates(from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket?.emit("watch:webrtc-signal", {
          to: from,
          signal: { type: "answer", sdp: answer.sdp },
        });
      } else if (signal.type === "answer") {
        await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
        await flushQueuedCandidates(from, peer);
      }
    } catch (signalError) {
      setError(signalError.message || "A video call connection could not be completed.");
    }
  }, [createPeer, flushQueuedCandidates, socket]);

  const joinCall = useCallback(async () => {
    setError("");
    try {
      let stream = localStreamRef.current;
      if (!stream) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot start a camera or microphone call.");
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setAudioEnabled(true);
        setVideoEnabled(true);
      }

      const response = await emitWithAck("watch:call-join");
      setInCall(true);
      await Promise.all(response.existingSockets.map((socketId) => createOffer(socketId)));
    } catch (callError) {
      await emitWithAck("watch:call-leave").catch(() => undefined);
      stopLocalStream();
      setError(callError.message || "Could not join the video call.");
      throw callError;
    }
  }, [createOffer, emitWithAck, stopLocalStream]);

  const leaveCall = useCallback(async () => {
    try {
      await emitWithAck("watch:call-leave");
    } catch {
      // Cleanup still needs to happen when a network interruption prevents the acknowledgement.
    }
    closeAllPeers();
    stopLocalStream();
    setInCall(false);
    setFloatingCallVisible(false);
  }, [closeAllPeers, emitWithAck, stopLocalStream]);

  const toggleAudio = useCallback(() => {
    const nextEnabled = !audioEnabled;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = nextEnabled; });
    setAudioEnabled(nextEnabled);
  }, [audioEnabled]);

  const toggleVideo = useCallback(() => {
    const nextEnabled = !videoEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = nextEnabled; });
    setVideoEnabled(nextEnabled);
  }, [videoEnabled]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on("watch:webrtc-signal", handleSignal);
    socket.on("watch:call-participant-left", ({ socketId }) => closePeer(socketId));
    return () => {
      socket.off("watch:webrtc-signal", handleSignal);
      socket.off("watch:call-participant-left");
    };
  }, [closePeer, handleSignal, socket]);

  useEffect(() => () => {
    closeAllPeers();
    stopLocalStream();
  }, [closeAllPeers, stopLocalStream]);

  return {
    localStream,
    remoteStreams: Object.entries(remoteStreams).map(([socketId, value]) => ({ socketId, ...value })),
    inCall,
    audioEnabled,
    videoEnabled,
    floatingCallVisible,
    error,
    joinCall,
    leaveCall,
    toggleAudio,
    toggleVideo,
    setFloatingCallVisible,
  };
};

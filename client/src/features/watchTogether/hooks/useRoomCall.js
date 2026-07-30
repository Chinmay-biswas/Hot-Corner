import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];
const ICE_SERVER_REFRESH_MS = 90 * 60 * 1000;
const PEER_DISCONNECT_GRACE_MS = 8_000;
const PEER_RESTART_DELAY_MS = 800;
const MAX_ICE_RESTARTS = 3;

const getCameraConstraints = () => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30, max: 30 },
  },
});

export const useRoomCall = ({ socket, emitWithAck, roomJoinVersion, axios, getToken }) => {
  const peersRef = useRef(new Map());
  const peerMetadataRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(new Map());
  const queuedCandidatesRef = useRef(new Map());
  const inCallRef = useRef(false);
  const callJoinInFlightRef = useRef(false);
  const restartPeerRef = useRef(null);
  const iceConfigRef = useRef({ servers: DEFAULT_ICE_SERVERS, fetchedAt: 0, request: null });
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [inCall, setInCall] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [floatingCallVisible, setFloatingCallVisible] = useState(false);
  const [error, setError] = useState("");

  const getPeerMetadata = useCallback((socketId) => {
    const existing = peerMetadataRef.current.get(socketId);
    if (existing) return existing;

    const metadata = {
      polite: String(socket?.id || "") > String(socketId),
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      restartAttempts: 0,
      recoveryTimer: null,
    };
    peerMetadataRef.current.set(socketId, metadata);
    return metadata;
  }, [socket?.id]);

  const clearPeerRecovery = useCallback((socketId) => {
    const metadata = peerMetadataRef.current.get(socketId);
    if (metadata?.recoveryTimer) window.clearTimeout(metadata.recoveryTimer);
    if (metadata) {
      metadata.recoveryTimer = null;
      metadata.restartAttempts = 0;
    }
  }, []);

  const closePeer = useCallback((socketId) => {
    const metadata = peerMetadataRef.current.get(socketId);
    if (metadata?.recoveryTimer) window.clearTimeout(metadata.recoveryTimer);
    peerMetadataRef.current.delete(socketId);

    const peer = peersRef.current.get(socketId);
    if (peer) {
      peer.onicecandidate = null;
      peer.ontrack = null;
      peer.onconnectionstatechange = null;
      peer.oniceconnectionstatechange = null;
      peer.close();
      peersRef.current.delete(socketId);
    }
    queuedCandidatesRef.current.delete(socketId);
    remoteStreamRef.current.delete(socketId);
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

  const loadIceServers = useCallback(async ({ force = false } = {}) => {
    const cached = iceConfigRef.current;
    if (!force && cached.request) return cached.request;
    if (!force && cached.fetchedAt && Date.now() - cached.fetchedAt < ICE_SERVER_REFRESH_MS) return cached.servers;

    const request = (async () => {
      try {
        if (!axios || !getToken) return DEFAULT_ICE_SERVERS;
        const token = await getToken({ skipCache: true });
        const { data } = await axios.get("/api/watch-together/ice-servers", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (data?.success && Array.isArray(data.iceServers) && data.iceServers.length) {
          iceConfigRef.current.servers = data.iceServers;
          iceConfigRef.current.fetchedAt = Date.now();
          return data.iceServers;
        }
      } catch {
        // A STUN-only call can still work on open networks; peer recovery will retry after reconnecting.
      } finally {
        iceConfigRef.current.request = null;
      }

      iceConfigRef.current.servers = DEFAULT_ICE_SERVERS;
      iceConfigRef.current.fetchedAt = Date.now();
      return DEFAULT_ICE_SERVERS;
    })();
    iceConfigRef.current.request = request;
    return request;
  }, [axios, getToken]);

  const flushQueuedCandidates = useCallback(async (socketId, peer) => {
    const candidates = queuedCandidatesRef.current.get(socketId) || [];
    queuedCandidatesRef.current.delete(socketId);
    await Promise.all(candidates.map((candidate) => peer.addIceCandidate(candidate).catch(() => undefined)));
  }, []);

  const sendSignal = useCallback((socketId, signal) => {
    if (!socket?.connected || !inCallRef.current) return;
    socket.emit("watch:webrtc-signal", { to: socketId, signal });
  }, [socket]);

  const createPeer = useCallback(async (socketId, participant) => {
    const existingPeer = peersRef.current.get(socketId);
    if (existingPeer) return existingPeer;
    if (!localStreamRef.current) throw new Error("Join the call before connecting to other people.");

    const iceServers = await loadIceServers();
    const peer = new RTCPeerConnection({ iceServers });
    peersRef.current.set(socketId, peer);
    getPeerMetadata(socketId);
    localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current));

    const scheduleRecovery = (immediate = false) => {
      const metadata = getPeerMetadata(socketId);
      if (metadata.recoveryTimer || peer.connectionState === "closed") return;

      metadata.recoveryTimer = window.setTimeout(() => {
        metadata.recoveryTimer = null;
        if (!inCallRef.current || peersRef.current.get(socketId) !== peer || peer.connectionState === "connected") return;
        restartPeerRef.current?.(socketId, immediate);
      }, immediate ? PEER_RESTART_DELAY_MS : PEER_DISCONNECT_GRACE_MS);
    };

    peer.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal(socketId, { type: "candidate", candidate: candidate.toJSON?.() || candidate });
    };
    peer.ontrack = ({ streams, track }) => {
      let stream = streams?.[0] || remoteStreamRef.current.get(socketId);
      if (!stream) stream = new MediaStream();
      if (track && !stream.getTracks().some((currentTrack) => currentTrack.id === track.id)) stream.addTrack(track);
      remoteStreamRef.current.set(socketId, stream);
      setRemoteStreams((current) => ({
        ...current,
        [socketId]: { stream, participant: participant || current[socketId]?.participant },
      }));
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        clearPeerRecovery(socketId);
        return;
      }
      if (peer.connectionState === "closed") {
        closePeer(socketId);
        return;
      }
      if (peer.connectionState === "failed") scheduleRecovery(true);
      if (peer.connectionState === "disconnected") scheduleRecovery(false);
    };
    peer.oniceconnectionstatechange = () => {
      if (peer.iceConnectionState === "connected" || peer.iceConnectionState === "completed") {
        clearPeerRecovery(socketId);
      } else if (peer.iceConnectionState === "failed") {
        scheduleRecovery(true);
      } else if (peer.iceConnectionState === "disconnected") {
        scheduleRecovery(false);
      }
    };
    return peer;
  }, [clearPeerRecovery, closePeer, getPeerMetadata, loadIceServers, sendSignal]);

  const createOffer = useCallback(async (socketId, participant, { iceRestart = false } = {}) => {
    const peer = await createPeer(socketId, participant);
    if (peer.signalingState !== "stable") return false;

    const metadata = getPeerMetadata(socketId);
    metadata.makingOffer = true;
    try {
      const offer = await peer.createOffer(iceRestart ? { iceRestart: true } : undefined);
      await peer.setLocalDescription(offer);
      sendSignal(socketId, { type: "offer", sdp: offer.sdp });
      return true;
    } finally {
      metadata.makingOffer = false;
    }
  }, [createPeer, getPeerMetadata, sendSignal]);

  const restartPeer = useCallback(async (socketId) => {
    const peer = peersRef.current.get(socketId);
    if (!peer || !socket?.connected || !inCallRef.current) return;

    const metadata = getPeerMetadata(socketId);
    if (metadata.restartAttempts >= MAX_ICE_RESTARTS) {
      closePeer(socketId);
      setError("Trying to rebuild a room call connection.");
      window.setTimeout(() => {
        if (inCallRef.current && socket?.connected) void createOffer(socketId, undefined, { iceRestart: true });
      }, PEER_DISCONNECT_GRACE_MS);
      return;
    }

    metadata.restartAttempts += 1;
    try {
      const iceServers = await loadIceServers({ force: true });
      peer.setConfiguration({ iceServers });
      const offerWasCreated = await createOffer(socketId, undefined, { iceRestart: true });
      if (!offerWasCreated) {
        metadata.recoveryTimer = window.setTimeout(() => {
          metadata.recoveryTimer = null;
          restartPeerRef.current?.(socketId, true);
        }, PEER_RESTART_DELAY_MS);
      }
    } catch {
      setError("The room call is reconnecting. Your camera and microphone will stay on.");
      const freshMetadata = getPeerMetadata(socketId);
      if (!freshMetadata.recoveryTimer) {
        freshMetadata.recoveryTimer = window.setTimeout(() => {
          freshMetadata.recoveryTimer = null;
          restartPeerRef.current?.(socketId, true);
        }, PEER_DISCONNECT_GRACE_MS);
      }
    }
  }, [closePeer, createOffer, getPeerMetadata, loadIceServers, socket]);

  useEffect(() => {
    restartPeerRef.current = restartPeer;
    return () => { restartPeerRef.current = null; };
  }, [restartPeer]);

  const handleSignal = useCallback(async ({ from, participant, signal }) => {
    if (!signal || !from || !inCallRef.current) return;
    try {
      if (signal.type === "candidate") {
        const peer = peersRef.current.get(from);
        const metadata = getPeerMetadata(from);
        if (metadata.ignoreOffer) return;
        if (!peer || !peer.remoteDescription) {
          const queued = queuedCandidatesRef.current.get(from) || [];
          queued.push(signal.candidate);
          queuedCandidatesRef.current.set(from, queued);
          return;
        }
        await peer.addIceCandidate(signal.candidate);
        return;
      }

      const peer = await createPeer(from, participant);
      const metadata = getPeerMetadata(from);
      if (signal.type === "offer") {
        const offerCollision = metadata.makingOffer || peer.signalingState !== "stable";
        metadata.ignoreOffer = !metadata.polite && offerCollision;
        if (metadata.ignoreOffer) return;

        if (offerCollision && peer.signalingState !== "stable") {
          await peer.setLocalDescription({ type: "rollback" });
        }
        await peer.setRemoteDescription({ type: "offer", sdp: signal.sdp });
        await flushQueuedCandidates(from, peer);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal(from, { type: "answer", sdp: answer.sdp });
      } else if (signal.type === "answer") {
        metadata.isSettingRemoteAnswerPending = true;
        try {
          await peer.setRemoteDescription({ type: "answer", sdp: signal.sdp });
          await flushQueuedCandidates(from, peer);
        } finally {
          metadata.isSettingRemoteAnswerPending = false;
        }
      }
    } catch (signalError) {
      setError(signalError.message || "A video call connection could not be completed.");
    }
  }, [createPeer, flushQueuedCandidates, getPeerMetadata, sendSignal]);

  const joinSocketCall = useCallback(async () => {
    const response = await emitWithAck("watch:call-join");
    const existingSockets = Array.isArray(response.existingSockets) ? response.existingSockets : [];
    setInCall(true);
    inCallRef.current = true;
    await Promise.all(existingSockets.map((socketId) => createOffer(socketId)));
    return response;
  }, [createOffer, emitWithAck]);

  const joinCall = useCallback(async () => {
    setError("");
    try {
      await loadIceServers({ force: true });
      let stream = localStreamRef.current;
      if (!stream) {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser cannot start a camera or microphone call.");
        stream = await navigator.mediaDevices.getUserMedia(getCameraConstraints());
        localStreamRef.current = stream;
        setLocalStream(stream);
        setAudioEnabled(true);
        setVideoEnabled(true);
      }

      await joinSocketCall();
    } catch (callError) {
      await emitWithAck("watch:call-leave").catch(() => undefined);
      stopLocalStream();
      inCallRef.current = false;
      setInCall(false);
      setError(callError.message || "Could not join the video call.");
      throw callError;
    }
  }, [emitWithAck, joinSocketCall, loadIceServers, stopLocalStream]);

  const rejoinRoomCall = useCallback(async () => {
    if (!inCallRef.current || !localStreamRef.current || callJoinInFlightRef.current) return;

    callJoinInFlightRef.current = true;
    try {
      closeAllPeers();
      await joinSocketCall();
      setError("");
    } catch {
      setError("Room call reconnecting. Your camera and microphone will stay on.");
    } finally {
      callJoinInFlightRef.current = false;
    }
  }, [closeAllPeers, joinSocketCall]);

  const leaveCall = useCallback(async () => {
    inCallRef.current = false;
    callJoinInFlightRef.current = false;
    try {
      await emitWithAck("watch:call-leave");
    } catch {
      // Local media must still stop when a temporary network failure prevents the acknowledgement.
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
    const onSocketDisconnect = () => {
      if (!inCallRef.current) return;
      closeAllPeers();
      setError("Room call reconnecting. Your camera and microphone will stay on.");
    };
    const onCallState = ({ socketIds = [] }) => {
      if (!inCallRef.current || !Array.isArray(socketIds)) return;
      const activeSocketIds = new Set(socketIds);
      [...peersRef.current.keys()]
        .filter((socketId) => !activeSocketIds.has(socketId))
        .forEach(closePeer);
    };
    socket.on("watch:webrtc-signal", handleSignal);
    socket.on("watch:call-participant-left", ({ socketId }) => closePeer(socketId));
    socket.on("watch:call-state", onCallState);
    socket.on("disconnect", onSocketDisconnect);
    return () => {
      socket.off("watch:webrtc-signal", handleSignal);
      socket.off("watch:call-participant-left");
      socket.off("watch:call-state", onCallState);
      socket.off("disconnect", onSocketDisconnect);
    };
  }, [closeAllPeers, closePeer, handleSignal, socket]);

  useEffect(() => {
    void rejoinRoomCall();
  }, [rejoinRoomCall, roomJoinVersion]);

  useEffect(() => () => {
    inCallRef.current = false;
    callJoinInFlightRef.current = false;
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

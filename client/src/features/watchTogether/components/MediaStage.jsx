import { useCallback, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { Expand, FastForward, Pause, Play, Rewind, Volume2 } from "lucide-react";
import { formatPlaybackTime, getPlaybackSyncPlan } from "../lib/media";

const REMOTE_EVENT_SUPPRESSION_MS = 1200;
const DRIFT_CHECK_INTERVAL_MS = 1000;

const MediaStage = ({ room, onPlayback }) => {
  const playerRef = useRef(null);
  const driveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const suppressUntilRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  const lastPlaybackStateRef = useRef(null);
  const lastReportedActionRef = useRef({ key: "", sentAt: 0 });
  const scrubbingRef = useRef(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [driveFallback, setDriveFallback] = useState(false);
  const [error, setError] = useState("");

  const media = room.media;
  const isYoutube = media.source === "youtube";
  const canControl = room.isHost && !driveFallback;
  const playback = room.playback;

  const getCurrentTime = useCallback(() => {
    if (isYoutube) return Number(playerRef.current?.getCurrentTime?.() || 0);
    return Number(driveVideoRef.current?.currentTime || 0);
  }, [isYoutube]);

  const suppressLocalEvents = useCallback(() => {
    suppressUntilRef.current = Math.max(suppressUntilRef.current, Date.now() + REMOTE_EVENT_SUPPRESSION_MS);
  }, []);

  const setLocalPlaybackRate = useCallback((nextRate) => {
    const normalizedRate = nextRate === 1.5 || nextRate === 0.75 ? nextRate : 1;
    setPlaybackRate((current) => current === normalizedRate ? current : normalizedRate);

    const video = driveVideoRef.current;
    if (video && Math.abs(video.playbackRate - normalizedRate) > 0.01) {
      video.playbackRate = normalizedRate;
    }
  }, []);

  const syncPlayback = useCallback((forceSync = false) => {
    const plan = getPlaybackSyncPlan({
      playback,
      localTime: getCurrentTime(),
      duration,
      forceSync,
    });
    const playbackStateChanged = lastPlaybackStateRef.current !== playback.isPlaying;
    lastPlaybackStateRef.current = playback.isPlaying;
    setLocalPlaybackRate(plan.playbackRate);

    if (plan.shouldSeek || playbackStateChanged) suppressLocalEvents();

    if (plan.shouldSeek) {
      setCurrentTime(plan.targetTime);
      if (isYoutube) playerRef.current?.seekTo(plan.targetTime, "seconds");
      else if (driveVideoRef.current) driveVideoRef.current.currentTime = plan.targetTime;
    }

    if (!isYoutube) {
      const video = driveVideoRef.current;
      if (!video) return;

      if (playback.isPlaying && video.paused) {
        video.play().catch(() => setError("Interact with the Drive video once to allow playback in this browser."));
      } else if (!playback.isPlaying && !video.paused) {
        video.pause();
      }
    }
  }, [duration, getCurrentTime, isYoutube, playback, setLocalPlaybackRate, suppressLocalEvents]);

  useEffect(() => {
    setDriveFallback(false);
    setDuration(0);
    setCurrentTime(0);
    setPlaybackRate(1);
    lastPlaybackStateRef.current = null;
  }, [media.url]);

  useEffect(() => {
    syncPlayback(Boolean(playback.forceSync));
  }, [playback.forceSync, playback.updatedAt, syncPlayback]);

  useEffect(() => {
    if (!playback.isPlaying) return undefined;

    const intervalId = window.setInterval(() => syncPlayback(false), DRIFT_CHECK_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [playback.isPlaying, syncPlayback]);

  useEffect(() => {
    const video = driveVideoRef.current;
    if (video) video.volume = volume;
  }, [volume, media.url]);

  const reportPlayback = useCallback(async ({ isPlaying, time = getCurrentTime(), forceSync = false }) => {
    if (!canControl || Date.now() < suppressUntilRef.current) return;

    const currentTimeValue = Math.max(0, Number(time || 0));
    const actionKey = `${isPlaying}:${currentTimeValue.toFixed(2)}:${forceSync}`;
    const now = Date.now();
    if (lastReportedActionRef.current.key === actionKey && now - lastReportedActionRef.current.sentAt < 250) return;

    lastReportedActionRef.current = { key: actionKey, sentAt: now };
    try {
      await onPlayback({ isPlaying, currentTime: currentTimeValue, forceSync });
      setError("");
    } catch (playbackError) {
      setError(playbackError.message || "Playback could not be synchronized.");
    }
  }, [canControl, getCurrentTime, onPlayback]);

  const movePlayerTo = useCallback((nextTime) => {
    const targetTime = Math.max(0, Math.min(Number(nextTime), duration || Number.MAX_SAFE_INTEGER));
    if (isYoutube) playerRef.current?.seekTo(targetTime, "seconds");
    else if (driveVideoRef.current) driveVideoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    return targetTime;
  }, [duration, isYoutube]);

  const seek = useCallback((nextTime) => {
    if (!canControl) return;
    const targetTime = movePlayerTo(nextTime);
    lastHeartbeatRef.current = Date.now();
    reportPlayback({ isPlaying: playback.isPlaying, time: targetTime, forceSync: true });
  }, [canControl, movePlayerTo, playback.isPlaying, reportPlayback]);

  const previewSeek = useCallback((nextTime) => {
    if (!canControl) return;
    movePlayerTo(nextTime);
  }, [canControl, movePlayerTo]);

  const finishScrubbing = useCallback((event) => {
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    seek(event.currentTarget.value);
  }, [seek]);

  const reportProgress = useCallback((time) => {
    setCurrentTime(time);
    if (
      canControl
      && playback.isPlaying
      && !scrubbingRef.current
      && Date.now() - lastHeartbeatRef.current > 8000
    ) {
      lastHeartbeatRef.current = Date.now();
      reportPlayback({ isPlaying: true, time });
    }
  }, [canControl, playback.isPlaying, reportPlayback]);

  const togglePlay = () => reportPlayback({ isPlaying: !playback.isPlaying });

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) stageRef.current?.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  return (
    <section className="border border-white/10 bg-white/[0.025] rounded-lg overflow-hidden">
      <div className="min-h-14 px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-medium">{media.title}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{isYoutube ? "YouTube" : "Google Drive"}</p>
        </div>
        <span className={`text-xs ${room.isHost ? "text-primary" : "text-gray-500"}`}>
          {room.isHost ? "You control playback" : "Room creator controls"}
        </span>
      </div>

      <div ref={stageRef} className="relative aspect-video bg-black">
        {isYoutube ? (
          <ReactPlayer
            ref={playerRef}
            url={media.url}
            playing={Boolean(playback.isPlaying)}
            playbackRate={playbackRate}
            volume={volume}
            width="100%"
            height="100%"
            className="absolute inset-0"
            controls={false}
            onReady={() => syncPlayback(Boolean(playback.forceSync))}
            onDuration={setDuration}
            onProgress={({ playedSeconds }) => reportProgress(playedSeconds)}
            onPlay={() => reportPlayback({ isPlaying: true })}
            onPause={() => reportPlayback({ isPlaying: false })}
            onError={() => setError("This YouTube video cannot be played in an embedded room.")}
          />
        ) : driveFallback ? (
          <iframe
            title={media.title}
            src={media.previewUrl}
            className="w-full h-full border-0"
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        ) : (
          <video
            ref={driveVideoRef}
            src={media.url}
            className="w-full h-full object-contain"
            playsInline
            preload="metadata"
            onLoadedMetadata={(event) => {
              setDuration(event.currentTarget.duration || 0);
              syncPlayback(Boolean(playback.forceSync));
            }}
            onTimeUpdate={(event) => reportProgress(event.currentTarget.currentTime)}
            onPlay={() => reportPlayback({ isPlaying: true })}
            onPause={() => reportPlayback({ isPlaying: false })}
            onError={() => {
              setDriveFallback(true);
              setError("Google Drive opened its preview because this file could not stream directly.");
            }}
          />
        )}
      </div>

      <div className="px-4 py-3 border-t border-white/10 space-y-3">
        {error && <p className="text-xs text-amber-200">{error}</p>}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => seek(getCurrentTime() - 10)}
            disabled={!canControl}
            title="Back 10 seconds"
            aria-label="Back 10 seconds"
            className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 disabled:opacity-40 transition rounded-lg cursor-pointer disabled:cursor-not-allowed"
          >
            <Rewind className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={!canControl}
            title={playback.isPlaying ? "Pause for everyone" : "Play for everyone"}
            aria-label={playback.isPlaying ? "Pause for everyone" : "Play for everyone"}
            className="w-10 h-9 flex items-center justify-center bg-primary hover:bg-primary-dull disabled:opacity-40 transition rounded-lg cursor-pointer disabled:cursor-not-allowed"
          >
            {playback.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => seek(getCurrentTime() + 10)}
            disabled={!canControl}
            title="Forward 10 seconds"
            aria-label="Forward 10 seconds"
            className="w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 disabled:opacity-40 transition rounded-lg cursor-pointer disabled:cursor-not-allowed"
          >
            <FastForward className="w-4 h-4" />
          </button>
          <span className="ml-auto text-xs tabular-nums text-gray-400">{formatPlaybackTime(currentTime)} / {formatPlaybackTime(duration)}</span>
        </div>
        <input
          type="range"
          min="0"
          max={Math.max(duration, 1)}
          step="0.1"
          value={Math.min(currentTime, Math.max(duration, 1))}
          onPointerDown={() => { scrubbingRef.current = true; }}
          onPointerUp={finishScrubbing}
          onPointerCancel={finishScrubbing}
          onKeyDown={() => { scrubbingRef.current = true; }}
          onKeyUp={finishScrubbing}
          onChange={(event) => {
            previewSeek(event.target.value);
            if (!scrubbingRef.current) seek(event.target.value);
          }}
          disabled={!canControl}
          aria-label="Playback position"
          className="w-full accent-primary disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-gray-400" />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
            aria-label="Local volume"
            className="w-24 accent-primary cursor-pointer"
          />
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Toggle fullscreen"
            aria-label="Toggle fullscreen"
            className="ml-auto w-9 h-9 flex items-center justify-center border border-white/15 hover:border-white/40 transition rounded-lg cursor-pointer"
          >
            <Expand className="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>
  );
};

export default MediaStage;

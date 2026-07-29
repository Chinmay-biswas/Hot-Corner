import { useCallback, useEffect, useRef, useState } from "react";
import ReactPlayer from "react-player";
import { Expand, FastForward, Pause, Play, Rewind, Volume2 } from "lucide-react";
import { formatPlaybackTime, getPlaybackTime } from "../lib/media";

const MediaStage = ({ room, onPlayback }) => {
  const playerRef = useRef(null);
  const driveVideoRef = useRef(null);
  const stageRef = useRef(null);
  const applyingSyncRef = useRef(false);
  const lastRemoteSyncRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [driveFallback, setDriveFallback] = useState(false);
  const [error, setError] = useState("");

  const media = room.media;
  const isYoutube = media.source === "youtube";
  const canControl = room.canControl && !driveFallback;
  const playback = room.playback;

  const getCurrentTime = useCallback(() => {
    if (isYoutube) return Number(playerRef.current?.getCurrentTime?.() || 0);
    return Number(driveVideoRef.current?.currentTime || 0);
  }, [isYoutube]);

  const applyPlayback = useCallback(() => {
    const targetTime = getPlaybackTime(playback);
    applyingSyncRef.current = true;
    lastRemoteSyncRef.current = Date.now();
    setCurrentTime(targetTime);

    if (isYoutube) {
      const player = playerRef.current;
      if (player && Math.abs(Number(player.getCurrentTime?.() || 0) - targetTime) > 0.75) {
        player.seekTo(targetTime, "seconds");
      }
    } else {
      const video = driveVideoRef.current;
      if (video) {
        if (Math.abs(video.currentTime - targetTime) > 0.75) video.currentTime = targetTime;
        if (playback.isPlaying) {
          video.play().catch(() => setError("Press play once to allow this browser to start the Drive video."));
        } else {
          video.pause();
        }
      }
    }

    const timeoutId = window.setTimeout(() => { applyingSyncRef.current = false; }, 700);
    return () => window.clearTimeout(timeoutId);
  }, [isYoutube, playback]);

  useEffect(() => {
    setDriveFallback(false);
    setDuration(0);
    setCurrentTime(0);
  }, [media.url]);

  useEffect(() => applyPlayback(), [applyPlayback]);

  useEffect(() => {
    const video = driveVideoRef.current;
    if (video) video.volume = volume;
  }, [volume, media.url]);

  const reportPlayback = useCallback(async (isPlaying, time = getCurrentTime()) => {
    if (!canControl || applyingSyncRef.current || Date.now() - lastRemoteSyncRef.current < 850) return;
    try {
      await onPlayback({ isPlaying, currentTime: Math.max(0, Number(time || 0)) });
      setError("");
    } catch (playbackError) {
      setError(playbackError.message || "Playback could not be synchronized.");
    }
  }, [canControl, getCurrentTime, onPlayback]);

  const seek = useCallback((nextTime) => {
    const targetTime = Math.max(0, Math.min(Number(nextTime), duration || Number.MAX_SAFE_INTEGER));
    if (!canControl) return;

    if (isYoutube) playerRef.current?.seekTo(targetTime, "seconds");
    else if (driveVideoRef.current) driveVideoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
    reportPlayback(playback.isPlaying, targetTime);
  }, [canControl, duration, isYoutube, playback.isPlaying, reportPlayback]);

  const reportProgress = useCallback((time) => {
    setCurrentTime(time);
    if (
      canControl
      && playback.isPlaying
      && Date.now() - lastHeartbeatRef.current > 8000
      && Date.now() - lastRemoteSyncRef.current > 1500
    ) {
      lastHeartbeatRef.current = Date.now();
      reportPlayback(true, time);
    }
  }, [canControl, playback.isPlaying, reportPlayback]);

  const togglePlay = () => reportPlayback(!playback.isPlaying);

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
        <span className={`text-xs ${room.canControl ? "text-primary" : "text-gray-500"}`}>
          {room.canControl ? "Shared controls" : "Host controls"}
        </span>
      </div>

      <div ref={stageRef} className="relative aspect-video bg-black">
        {isYoutube ? (
          <ReactPlayer
            ref={playerRef}
            url={media.url}
            playing={Boolean(playback.isPlaying)}
            volume={volume}
            width="100%"
            height="100%"
            className="absolute inset-0"
            controls={false}
            onReady={applyPlayback}
            onDuration={setDuration}
            onProgress={({ playedSeconds }) => reportProgress(playedSeconds)}
            onPlay={() => reportPlayback(true)}
            onPause={() => reportPlayback(false)}
            onSeek={(seconds) => reportPlayback(playback.isPlaying, seconds)}
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
              applyPlayback();
            }}
            onTimeUpdate={(event) => reportProgress(event.currentTarget.currentTime)}
            onPlay={() => reportPlayback(true)}
            onPause={() => reportPlayback(false)}
            onSeeked={(event) => reportPlayback(playback.isPlaying, event.currentTarget.currentTime)}
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
          onChange={(event) => seek(event.target.value)}
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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  readVideoPlayerVolumePreference,
  writeVideoPlayerVolumePreference,
} from "./volume-preference";

const OVERLAY_HIDE_DELAY_MS = 2000;
const CENTER_FEEDBACK_HOLD_MS = 400;

type UseVideoPlayerOptions = {
  autoPlay?: boolean;
  seekStepSeconds: number;
};

export function useVideoPlayer({ autoPlay = false, seekStepSeconds }: UseVideoPlayerOptions) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clearRecentActivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const centerFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [centerFeedbackAction, setCenterFeedbackAction] = useState<"play" | "pause" | null>(null);
  const [centerFeedbackVisible, setCenterFeedbackVisible] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasRecentActivity, setHasRecentActivity] = useState(false);

  const clearCenterFeedbackTimeout = useCallback(() => {
    if (centerFeedbackTimeoutRef.current !== null) {
      clearTimeout(centerFeedbackTimeoutRef.current);
      centerFeedbackTimeoutRef.current = null;
    }
  }, []);

  const triggerCenterFeedback = useCallback(
    (action: "play" | "pause") => {
      clearCenterFeedbackTimeout();
      setCenterFeedbackAction(action);
      setCenterFeedbackVisible(true);
      centerFeedbackTimeoutRef.current = setTimeout(() => {
        setCenterFeedbackVisible(false);
      }, CENTER_FEEDBACK_HOLD_MS);
    },
    [clearCenterFeedbackTimeout],
  );

  const onUserActivity = useCallback(() => {
    setHasRecentActivity(true);

    if (clearRecentActivityTimeoutRef.current !== null) {
      clearTimeout(clearRecentActivityTimeoutRef.current);
      clearRecentActivityTimeoutRef.current = null;
    }

    clearRecentActivityTimeoutRef.current = setTimeout(() => {
      setHasRecentActivity(false);
      clearRecentActivityTimeoutRef.current = null;
    }, OVERLAY_HIDE_DELAY_MS);
  }, []);

  const showControls = hasRecentActivity || !isPlaying;

  const play = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      return false;
    }

    try {
      await video.play();
      return true;
    } catch {
      return false;
    }
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, []);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (video.paused) {
      void play();
    } else {
      pause();
    }
  }, [pause, play]);

  const seek = useCallback(
    (time: number) => {
      const video = videoRef.current;
      if (!video || !Number.isFinite(time)) {
        return;
      }

      const nextTime = Math.min(Math.max(time, 0), duration || video.duration || 0);
      video.currentTime = nextTime;
      setCurrentTime(nextTime);
    },
    [duration],
  );

  const skipBy = useCallback(
    (seconds: number) => {
      const video = videoRef.current;
      if (!video) {
        return;
      }

      seek(video.currentTime + seconds);
    },
    [seek],
  );

  const skipBackward = useCallback(() => {
    skipBy(-seekStepSeconds);
  }, [skipBy, seekStepSeconds]);

  const skipForward = useCallback(() => {
    skipBy(seekStepSeconds);
  }, [skipBy, seekStepSeconds]);

  const setVideoVolume = useCallback((nextVolume: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const clampedVolume = Math.min(Math.max(nextVolume, 0), 1);
    const muted = clampedVolume === 0;
    video.volume = clampedVolume;
    video.muted = muted;
    setVolume(clampedVolume);
    setIsMuted(muted);
    writeVideoPlayerVolumePreference({ volume: clampedVolume, muted });
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.muted = !video.muted;
    setIsMuted(video.muted);
    if (!video.muted && video.volume === 0) {
      video.volume = 1;
      setVolume(1);
    }
    writeVideoPlayerVolumePreference({ volume: video.volume, muted: video.muted });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await container.requestFullscreen();
    } catch {
      // Fullscreen availability depends on browser support and user permission.
    }
  }, []);

  useLayoutEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const preference = readVideoPlayerVolumePreference();
    if (preference) {
      video.volume = preference.volume;
      video.muted = preference.muted;
      setVolume(preference.volume);
      setIsMuted(preference.muted);
    }

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
    };

    const handleVolumeChange = () => {
      setVolume(video.volume);
      setIsMuted(video.muted);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("volumechange", handleVolumeChange);

    if (video.readyState >= 1) {
      handleLoadedMetadata();
      setCurrentTime(video.currentTime);
    }

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("volumechange", handleVolumeChange);
    };
  }, []);

  useEffect(() => {
    if (!autoPlay) {
      return;
    }

    void play();
    onUserActivity();
  }, [autoPlay, onUserActivity, play]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (clearRecentActivityTimeoutRef.current !== null) {
        clearTimeout(clearRecentActivityTimeoutRef.current);
      }
      clearCenterFeedbackTimeout();
    };
  }, [clearCenterFeedbackTimeout]);

  return {
    containerRef,
    videoRef,
    isPlaying,
    centerFeedbackAction,
    centerFeedbackVisible,
    currentTime,
    duration,
    volume,
    isMuted,
    isFullscreen,
    hasRecentActivity,
    showControls,
    play,
    pause,
    togglePlay,
    seek,
    skipBackward,
    skipForward,
    setVideoVolume,
    toggleMute,
    toggleFullscreen,
    onUserActivity,
    triggerCenterFeedback,
  };
}

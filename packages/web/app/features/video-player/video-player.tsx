import { useCallback, useEffect, useRef, type PointerEvent } from "react";

import { cn } from "~/lib/utils";

import { useVideoPlayer } from "./use-video-player";
import { VideoPlayerCenterFeedback } from "./video-player-center-feedback";
import { VideoPlayerControls } from "./video-player-controls";

const SEEK_STEP_SECONDS = 10;
const DOUBLE_CLICK_THRESHOLD_MS = 200;

type VideoPlayerProps = {
  src: string;
  episodeTitle: string;
  workTitle: string;
  backHref: string;
  autoPlay?: boolean;
  className?: string;
};

function isVideoControlTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return target.closest("[data-video-control]") !== null;
}

export function VideoPlayer({
  src,
  episodeTitle,
  workTitle,
  backHref,
  autoPlay = false,
  className,
}: VideoPlayerProps) {
  const {
    containerRef,
    videoRef,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    isFullscreen,
    showControls,
    centerFeedback,
    centerFeedbackVisible,
    togglePlay,
    seek,
    skipBackward,
    skipForward,
    setVideoVolume,
    toggleMute,
    toggleFullscreen,
    onUserActivity,
    triggerCenterFeedback,
  } = useVideoPlayer({ autoPlay, seekStepSeconds: SEEK_STEP_SECONDS });

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMouseClickAtRef = useRef<number | null>(null);

  const clearClickTimer = useCallback(() => {
    if (clickTimerRef.current !== null) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }, []);

  const handleContainerSingleClick = useCallback(
    (shouldTogglePlay: boolean) => {
      clearClickTimer();
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        lastMouseClickAtRef.current = null;

        if (shouldTogglePlay) {
          triggerCenterFeedback({ type: isPlaying ? "pause" : "play" });
          togglePlay();
        }
        onUserActivity();
      }, DOUBLE_CLICK_THRESHOLD_MS);
    },
    [clearClickTimer, isPlaying, onUserActivity, togglePlay, triggerCenterFeedback],
  );

  const handleContainerPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isVideoControlTarget(event.target)) {
        return;
      }

      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      const shouldTogglePlay = event.pointerType !== "touch" || showControls;

      if (event.pointerType !== "mouse") {
        clearClickTimer();
        lastMouseClickAtRef.current = null;

        if (shouldTogglePlay) {
          triggerCenterFeedback({ type: isPlaying ? "pause" : "play" });
          togglePlay();
        }
        onUserActivity();
        return;
      }

      const lastMouseClickAt = lastMouseClickAtRef.current;
      if (
        lastMouseClickAt !== null &&
        event.timeStamp - lastMouseClickAt <= DOUBLE_CLICK_THRESHOLD_MS
      ) {
        lastMouseClickAtRef.current = null;
        clearClickTimer();
        void toggleFullscreen();
        onUserActivity();
        return;
      }

      lastMouseClickAtRef.current = event.timeStamp;
      handleContainerSingleClick(shouldTogglePlay);
    },
    [
      clearClickTimer,
      handleContainerSingleClick,
      isPlaying,
      onUserActivity,
      showControls,
      toggleFullscreen,
      togglePlay,
      triggerCenterFeedback,
    ],
  );

  useEffect(() => {
    return () => {
      clearClickTimer();
    };
  }, [clearClickTimer]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full bg-black", !showControls && "cursor-none", className)}
      onMouseMove={onUserActivity}
      onPointerUp={handleContainerPointerUp}
    >
      <video
        ref={videoRef}
        autoPlay={autoPlay}
        className="pointer-events-none h-full w-full object-contain"
        playsInline
        src={src}
      />
      {centerFeedback !== null ? (
        <VideoPlayerCenterFeedback
          feedback={centerFeedback}
          seekStepSeconds={SEEK_STEP_SECONDS}
          visible={centerFeedbackVisible}
        />
      ) : null}
      <VideoPlayerControls
        backHref={backHref}
        currentTime={currentTime}
        duration={duration}
        isFullscreen={isFullscreen}
        isMuted={isMuted}
        isPlaying={isPlaying}
        onSeek={(time) => {
          seek(time);
          onUserActivity();
        }}
        onSkipBackward={() => {
          skipBackward();
          onUserActivity();
        }}
        onSkipForward={() => {
          skipForward();
          onUserActivity();
        }}
        onToggleFullscreen={() => {
          void toggleFullscreen();
          onUserActivity();
        }}
        onToggleMute={() => {
          toggleMute();
          onUserActivity();
        }}
        onTogglePlay={() => {
          togglePlay();
          onUserActivity();
        }}
        onVolumeChange={(nextVolume) => {
          setVideoVolume(nextVolume);
          onUserActivity();
        }}
        seekStepSeconds={SEEK_STEP_SECONDS}
        showControls={showControls}
        episodeTitle={episodeTitle}
        workTitle={workTitle}
        volume={volume}
      />
    </div>
  );
}

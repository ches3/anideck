import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from "react";

import { cn } from "~/lib/utils";

import type { SeekThumbnailManifest } from "./seek-thumbnail";
import { useVideoPlayer } from "./use-video-player";
import { VideoPlayerCenterFeedback } from "./video-player-center-feedback";
import { VideoPlayerControls } from "./video-player-controls";

const SEEK_STEP_SECONDS = 10;
const DOUBLE_CLICK_THRESHOLD_MS = 200;

export type SeekThumbnailData = {
  manifest: SeekThumbnailManifest;
  spriteUrl: string;
};

type VideoPlayerProps = {
  src: string;
  episodeTitle: string;
  workTitle: string;
  backHref: string;
  seekThumbnail: SeekThumbnailData | null;
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
  seekThumbnail,
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
    beginControlInteraction,
    endControlInteraction,
    triggerCenterFeedback,
  } = useVideoPlayer({ autoPlay, seekStepSeconds: SEEK_STEP_SECONDS });

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMouseClickAtRef = useRef<number | null>(null);
  const activeControlPointerIdRef = useRef<number | null>(null);

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

  const handleContainerPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (isVideoControlTarget(event.target)) {
        activeControlPointerIdRef.current = event.pointerId;
        beginControlInteraction();
      }
    },
    [beginControlInteraction],
  );

  const handleContainerClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isVideoControlTarget(event.target)) {
        onUserActivity();
      }
    },
    [onUserActivity],
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
    const handleDocumentPointerEnd = (event: globalThis.PointerEvent) => {
      if (activeControlPointerIdRef.current !== event.pointerId) {
        return;
      }

      activeControlPointerIdRef.current = null;
      endControlInteraction();
    };

    document.addEventListener("pointerup", handleDocumentPointerEnd, { capture: true });
    document.addEventListener("pointercancel", handleDocumentPointerEnd, { capture: true });
    return () => {
      document.removeEventListener("pointerup", handleDocumentPointerEnd, { capture: true });
      document.removeEventListener("pointercancel", handleDocumentPointerEnd, { capture: true });
    };
  }, [endControlInteraction]);

  useEffect(() => {
    return () => {
      clearClickTimer();
    };
  }, [clearClickTimer]);

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full bg-black", !showControls && "cursor-none", className)}
      onClick={handleContainerClick}
      onMouseMove={onUserActivity}
      onPointerDown={handleContainerPointerDown}
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
        onSeek={seek}
        onSkipBackward={skipBackward}
        onSkipForward={skipForward}
        onToggleFullscreen={() => void toggleFullscreen()}
        onToggleMute={toggleMute}
        onTogglePlay={togglePlay}
        onVolumeChange={setVideoVolume}
        seekStepSeconds={SEEK_STEP_SECONDS}
        seekThumbnail={seekThumbnail ?? undefined}
        showControls={showControls}
        episodeTitle={episodeTitle}
        workTitle={workTitle}
        volume={volume}
      />
    </div>
  );
}

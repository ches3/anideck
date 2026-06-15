import { useCallback, type MouseEvent } from "react";

import { cn } from "~/lib/utils";

import { useVideoPlayer } from "./use-video-player";
import { VideoPlayerCenterFeedback } from "./video-player-center-feedback";
import { VideoPlayerControls } from "./video-player-controls";

const SEEK_STEP_SECONDS = 10;

type VideoPlayerProps = {
  src: string;
  episodeTitle: string;
  workTitle: string;
  backHref: string;
  autoPlay?: boolean;
  className?: string;
};

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
    centerFeedbackAction,
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

  const handleContainerClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("[data-video-control]")) {
        return;
      }

      const nativeEvent = event.nativeEvent;
      const pointerType =
        "pointerType" in nativeEvent && typeof nativeEvent.pointerType === "string"
          ? nativeEvent.pointerType
          : "mouse";
      const shouldTogglePlay = pointerType !== "touch" || showControls;

      if (shouldTogglePlay) {
        triggerCenterFeedback(isPlaying ? "pause" : "play");
        togglePlay();
      }
      onUserActivity();
    },
    [isPlaying, onUserActivity, showControls, togglePlay, triggerCenterFeedback],
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative h-full w-full bg-black", !showControls && "cursor-none", className)}
      onClick={handleContainerClick}
      onKeyDown={onUserActivity}
      onMouseMove={onUserActivity}
    >
      <video
        ref={videoRef}
        autoPlay={autoPlay}
        className="pointer-events-none h-full w-full object-contain"
        playsInline
        src={src}
      />
      {centerFeedbackAction !== null ? (
        <VideoPlayerCenterFeedback action={centerFeedbackAction} visible={centerFeedbackVisible} />
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

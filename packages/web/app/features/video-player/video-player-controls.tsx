import {
  ArrowLeftIcon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

import { useSeekPreview, type SeekThumbnailPreviewProps } from "./use-seek-preview";
import { formatDuration } from "./utils";
import { SkipSecondsIcon } from "./video-player-skip-seconds-icon";

const videoIconButtonClassName = cn(
  "shrink-0 rounded-full bg-transparent text-neutral-100 shadow-none",
  "hover:bg-white/10 hover:text-white active:bg-white/10 focus-visible:bg-white/10",
  "dark:hover:bg-white/10 dark:active:bg-white/10",
);

const videoButtonClassName = cn(videoIconButtonClassName, "size-12");
const videoIconClassName = "size-7 shrink-0";
const videoSliderClassName = cn(
  "min-h-6 items-center",
  "**:data-[slot=slider-track]:h-1 **:data-[slot=slider-track]:bg-white/30",
  "**:data-[slot=slider-range]:bg-white/90",
  "**:data-[slot=slider-thumb]:size-3 **:data-[slot=slider-thumb]:border-0",
);

const videoControlsGradientClassName = cn(
  "from-black/60 from-0% via-black/15 via-55% to-transparent to-100%",
  "h-48",
);

const videoControlsPaddingClassName = "px-4 sm:px-6";

const filledIconProps = {
  fill: "currentColor",
  strokeWidth: 0,
} as const;

const thickIconProps = {
  stroke: "currentColor",
  strokeWidth: 2.75,
} as const;

export type VideoPlayerControlsProps = {
  episodeTitle: string;
  workTitle: string;
  backHref: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isFullscreen: boolean;
  showControls: boolean;
  seekStepSeconds: number;
  seekThumbnail?: SeekThumbnailPreviewProps;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onSkipBackward: () => void;
  onSkipForward: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onToggleFullscreen: () => void;
};

export function VideoPlayerControls({
  episodeTitle,
  workTitle,
  backHref,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isFullscreen,
  showControls,
  seekStepSeconds,
  seekThumbnail,
  onTogglePlay,
  onSeek,
  onSkipBackward,
  onSkipForward,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
}: VideoPlayerControlsProps) {
  const volumeValue = isMuted ? 0 : volume;
  const {
    seekTrackRef,
    previewTooltipRef,
    seekTime,
    previewTime,
    previewLeftPx,
    isPreviewVisible,
    frameStyle,
    onSeekHoverMove,
    onSeekHoverEnd,
    onSeekDragEnd,
    onSeekValueChange,
    onSeekValueCommit,
  } = useSeekPreview({ currentTime, duration, seekThumbnail, onSeek });

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
        showControls ? "opacity-100" : "opacity-0",
      )}
    >
      <div className="relative shrink-0">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b",
            videoControlsGradientClassName,
          )}
        />
        <div
          className={cn(
            "relative flex flex-col",
            videoControlsPaddingClassName,
            "py-6 pb-4",
            showControls && "pointer-events-auto",
          )}
          data-video-control=""
        >
          <div className="flex items-start gap-3">
            <Button
              asChild
              aria-label="作品詳細に戻る"
              className={videoButtonClassName}
              size="icon"
              variant="ghost"
            >
              <Link to={backHref}>
                <ArrowLeftIcon className={videoIconClassName} {...thickIconProps} />
              </Link>
            </Button>
            <div className="min-w-0 pt-1">
              <p className="truncate text-sm text-neutral-300">{workTitle}</p>
              <h1 className="truncate text-lg font-medium text-neutral-50 sm:text-xl">
                {episodeTitle}
              </h1>
            </div>
          </div>
        </div>
      </div>

      <div className="relative shrink-0">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t",
            videoControlsGradientClassName,
          )}
        />
        <div
          className={cn(
            "relative grid",
            videoControlsPaddingClassName,
            "pt-4 pb-4",
            showControls && "pointer-events-auto",
          )}
          data-video-control=""
        >
          <div className="flex min-w-0 flex-col gap-1 place-self-end w-full">
            <div
              ref={seekTrackRef}
              className="relative mx-1.5"
              data-testid="seek-preview-track"
              onPointerLeave={onSeekHoverEnd}
              onPointerMove={onSeekHoverMove}
            >
              <div
                ref={previewTooltipRef}
                aria-hidden={!isPreviewVisible}
                className={cn(
                  "pointer-events-none absolute bottom-full z-10 mb-1 flex -translate-x-1/2 flex-col items-center",
                  !isPreviewVisible && "invisible",
                )}
                data-testid="seek-preview-tooltip"
                style={{
                  left: isPreviewVisible ? `${previewLeftPx}px` : "0%",
                }}
              >
                {frameStyle !== null && seekThumbnail !== undefined ? (
                  <div
                    className="w-64 overflow-hidden rounded-md bg-black shadow-lg outline outline-offset-0 outline-white/20"
                    data-testid="seek-preview-thumbnail"
                    style={{
                      aspectRatio: `${seekThumbnail.manifest.thumbnail.width} / ${seekThumbnail.manifest.thumbnail.height}`,
                      backgroundImage: frameStyle.backgroundImage,
                      backgroundPosition: frameStyle.backgroundPosition,
                      backgroundRepeat: frameStyle.backgroundRepeat,
                      backgroundSize: frameStyle.backgroundSize,
                    }}
                  />
                ) : null}
                <span className="mt-2 rounded bg-black/50 px-2 py-0.5 text-xs font-medium text-neutral-100 tabular-nums">
                  {previewTime === null ? null : formatDuration(previewTime)}
                </span>
              </div>
              <Slider
                aria-label="再生位置"
                className={videoSliderClassName}
                disabled={duration <= 0}
                max={duration > 0 ? duration : 1}
                min={0}
                onPointerCancel={onSeekDragEnd}
                onPointerEnter={onSeekHoverMove}
                onPointerUp={onSeekDragEnd}
                onValueChange={onSeekValueChange}
                onValueCommit={onSeekValueCommit}
                step={0.1}
                value={[seekTime]}
              />
            </div>
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              <div className="flex items-center gap-0.5 sm:gap-1">
                <Button
                  aria-label={isPlaying ? "一時停止" : "再生"}
                  className={videoButtonClassName}
                  onClick={onTogglePlay}
                  size="icon"
                  variant="ghost"
                >
                  {isPlaying ? (
                    <PauseIcon className={videoIconClassName} {...filledIconProps} />
                  ) : (
                    <PlayIcon className={videoIconClassName} {...filledIconProps} />
                  )}
                </Button>
                <Button
                  aria-label={`${seekStepSeconds}秒戻る`}
                  className={videoButtonClassName}
                  onClick={onSkipBackward}
                  size="icon"
                  variant="ghost"
                >
                  <SkipSecondsIcon
                    className="size-8"
                    direction="backward"
                    seekStepSeconds={seekStepSeconds}
                  />
                </Button>
                <Button
                  aria-label={`${seekStepSeconds}秒進む`}
                  className={videoButtonClassName}
                  onClick={onSkipForward}
                  size="icon"
                  variant="ghost"
                >
                  <SkipSecondsIcon
                    className="size-8"
                    direction="forward"
                    seekStepSeconds={seekStepSeconds}
                  />
                </Button>
                <Button
                  aria-label={isMuted ? "ミュート解除" : "ミュート"}
                  className={videoButtonClassName}
                  onClick={onToggleMute}
                  size="icon"
                  variant="ghost"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeXIcon className={videoIconClassName} {...thickIconProps} />
                  ) : (
                    <Volume2Icon className={videoIconClassName} {...thickIconProps} />
                  )}
                </Button>
                <Slider
                  aria-label="音量"
                  className={cn(videoSliderClassName, "hidden w-20 sm:flex")}
                  max={1}
                  min={0}
                  onValueChange={(values) => {
                    onVolumeChange(values[0] ?? 0);
                  }}
                  step={0.01}
                  value={[volumeValue]}
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-neutral-300 tabular-nums">
                  {formatDuration(currentTime)} / {formatDuration(duration)}
                </span>
                <Button
                  aria-label={isFullscreen ? "フルスクリーン解除" : "フルスクリーン"}
                  className={videoButtonClassName}
                  onClick={onToggleFullscreen}
                  size="icon"
                  variant="ghost"
                >
                  {isFullscreen ? (
                    <MinimizeIcon className={videoIconClassName} {...thickIconProps} />
                  ) : (
                    <MaximizeIcon className={videoIconClassName} {...thickIconProps} />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

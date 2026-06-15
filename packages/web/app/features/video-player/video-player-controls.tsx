import {
  ArrowLeftIcon,
  MaximizeIcon,
  MinimizeIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react";
import { Link } from "react-router";

import { Button } from "~/components/ui/button";
import { Slider } from "~/components/ui/slider";
import { cn } from "~/lib/utils";

import { formatDuration } from "./utils";

const videoIconButtonClassName = cn(
  "shrink-0 rounded-full bg-transparent text-neutral-100 shadow-none",
  "hover:bg-white/10 hover:text-white active:bg-white/10 focus-visible:bg-white/10",
  "dark:hover:bg-white/10 dark:active:bg-white/10",
);

const videoButtonClassName = cn(videoIconButtonClassName, "size-12");
const videoIconClassName = "size-7 shrink-0";
const skipIconClassName = "size-8 shrink-0";
const videoSliderClassName = cn(
  "min-h-6 items-center",
  "**:data-[slot=slider-track]:h-1 **:data-[slot=slider-track]:bg-white/30",
  "**:data-[slot=slider-range]:bg-white/90",
  "**:data-[slot=slider-thumb]:size-3 **:data-[slot=slider-thumb]:border-0",
);

const filledIconProps = {
  fill: "currentColor",
  strokeWidth: 0,
} as const;

const thickIconProps = {
  stroke: "currentColor",
  strokeWidth: 2.75,
} as const;

const skipIconProps = {
  stroke: "currentColor",
  strokeWidth: 2,
} as const;

function SkipSecondsIcon({
  direction,
  seekStepSeconds,
}: {
  direction: "backward" | "forward";
  seekStepSeconds: number;
}) {
  const Icon = direction === "backward" ? RotateCcwIcon : RotateCwIcon;

  return (
    <span className="relative inline-flex size-8 shrink-0 items-center justify-center">
      <Icon className={skipIconClassName} {...skipIconProps} />
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center pt-px text-[10px] font-semibold leading-none tabular-nums"
      >
        {seekStepSeconds}
      </span>
    </span>
  );
}

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
  onTogglePlay,
  onSeek,
  onSkipBackward,
  onSkipForward,
  onVolumeChange,
  onToggleMute,
  onToggleFullscreen,
}: VideoPlayerControlsProps) {
  const volumeValue = isMuted ? 0 : volume;

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300",
        showControls ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "bg-linear-to-b from-black/80 to-transparent p-4 sm:p-6",
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

      <div
        className={cn(
          "bg-linear-to-t from-black/80 via-black/40 to-transparent p-4 sm:p-6",
          showControls && "pointer-events-auto",
        )}
        data-video-control=""
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="px-1.5">
            <Slider
              aria-label="再生位置"
              className={videoSliderClassName}
              max={duration > 0 ? duration : 100}
              min={0}
              onValueChange={(values) => {
                onSeek(values[0] ?? 0);
              }}
              step={0.1}
              value={[currentTime]}
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
                <SkipSecondsIcon direction="backward" seekStepSeconds={seekStepSeconds} />
              </Button>
              <Button
                aria-label={`${seekStepSeconds}秒進む`}
                className={videoButtonClassName}
                onClick={onSkipForward}
                size="icon"
                variant="ghost"
              >
                <SkipSecondsIcon direction="forward" seekStepSeconds={seekStepSeconds} />
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
  );
}

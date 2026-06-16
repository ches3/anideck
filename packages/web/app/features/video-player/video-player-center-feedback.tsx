import { PauseIcon, PlayIcon, Volume2Icon, VolumeXIcon } from "lucide-react";

import { cn } from "~/lib/utils";

import type { CenterFeedback } from "./use-video-player";
import { SkipSecondsIcon } from "./video-player-skip-seconds-icon";

const CENTER_FEEDBACK_FADE_MS = 400;

const thickIconProps = {
  stroke: "currentColor",
  strokeWidth: 2.75,
} as const;

type VideoPlayerCenterFeedbackProps = {
  feedback: CenterFeedback;
  seekStepSeconds: number;
  visible: boolean;
};

function CenterFeedbackContent({
  feedback,
  seekStepSeconds,
}: {
  feedback: CenterFeedback;
  seekStepSeconds: number;
}) {
  switch (feedback.type) {
    case "play":
      return <PlayIcon fill="currentColor" strokeWidth={0} />;
    case "pause":
      return <PauseIcon fill="currentColor" strokeWidth={0} />;
    case "skipBackward":
      return (
        <SkipSecondsIcon
          className="size-16"
          direction="backward"
          numberClassName="text-xs"
          seekStepSeconds={seekStepSeconds}
        />
      );
    case "skipForward":
      return (
        <SkipSecondsIcon
          className="size-16"
          direction="forward"
          numberClassName="text-xs"
          seekStepSeconds={seekStepSeconds}
        />
      );
    case "volume": {
      const percent = Math.round(feedback.level * 100);
      const VolumeIcon = feedback.level === 0 ? VolumeXIcon : Volume2Icon;

      return (
        <span className="flex flex-col items-center">
          <VolumeIcon className="size-14 shrink-0" {...thickIconProps} />
          <span className="mt-1 text-sm font-semibold leading-none tabular-nums">{percent}%</span>
        </span>
      );
    }
    case "mute":
      return <VolumeXIcon className="size-16" {...thickIconProps} />;
  }
}

export function VideoPlayerCenterFeedback({
  feedback,
  seekStepSeconds,
  visible,
}: VideoPlayerCenterFeedbackProps) {
  const volumeLevel = feedback.type === "volume" ? Math.round(feedback.level * 100) : undefined;

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ transitionDuration: `${CENTER_FEEDBACK_FADE_MS}ms` }}
      data-video-center-feedback={feedback.type}
      {...(volumeLevel !== undefined ? { "data-volume-level": String(volumeLevel) } : {})}
    >
      <div
        className={cn(
          "flex size-28 items-center justify-center rounded-full bg-black/40 text-neutral-50",
          feedback.type === "play" || feedback.type === "pause" ? "[&_svg]:size-16" : "",
        )}
      >
        <CenterFeedbackContent feedback={feedback} seekStepSeconds={seekStepSeconds} />
      </div>
    </div>
  );
}

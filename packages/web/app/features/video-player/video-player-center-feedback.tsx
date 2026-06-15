import { PauseIcon, PlayIcon } from "lucide-react";

import { cn } from "~/lib/utils";

const CENTER_FEEDBACK_FADE_MS = 400;

type VideoPlayerCenterFeedbackProps = {
  action: "play" | "pause";
  visible: boolean;
};

export function VideoPlayerCenterFeedback({ action, visible }: VideoPlayerCenterFeedbackProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center transition-opacity",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{ transitionDuration: `${CENTER_FEEDBACK_FADE_MS}ms` }}
      data-video-play-feedback={action}
    >
      <div className="flex size-20 items-center justify-center rounded-full bg-black/40 text-neutral-50 [&_svg]:size-12">
        {action === "play" ? (
          <PlayIcon fill="currentColor" strokeWidth={0} />
        ) : (
          <PauseIcon fill="currentColor" strokeWidth={0} />
        )}
      </div>
    </div>
  );
}

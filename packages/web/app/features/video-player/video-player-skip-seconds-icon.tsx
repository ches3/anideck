import { RotateCcwIcon, RotateCwIcon } from "lucide-react";

import { cn } from "~/lib/utils";

const skipIconProps = {
  stroke: "currentColor",
  strokeWidth: 2,
} as const;

type SkipSecondsIconProps = {
  direction: "backward" | "forward";
  seekStepSeconds: number;
  className?: string;
  numberClassName?: string;
};

export function SkipSecondsIcon({
  direction,
  seekStepSeconds,
  className,
  numberClassName,
}: SkipSecondsIconProps) {
  const Icon = direction === "backward" ? RotateCcwIcon : RotateCwIcon;

  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", className)}>
      <Icon className="size-full" {...skipIconProps} />
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-0 flex items-center justify-center pt-px font-semibold leading-none tabular-nums",
          numberClassName ?? "text-[10px]",
        )}
      >
        {seekStepSeconds}
      </span>
    </span>
  );
}

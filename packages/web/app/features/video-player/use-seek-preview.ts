import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  computeSeekPreviewLeftPx,
  computeSeekPreviewTimeFromPointer,
  computeSeekThumbnailFrameStyle,
  type SeekThumbnailManifest,
} from "./seek-thumbnail";

export type SeekThumbnailPreviewProps = {
  manifest: SeekThumbnailManifest;
  spriteUrl: string;
};

type UseSeekPreviewOptions = {
  currentTime: number;
  duration: number;
  seekThumbnail?: SeekThumbnailPreviewProps;
  onSeek: (time: number) => void;
};

export function useSeekPreview({
  currentTime,
  duration,
  seekThumbnail,
  onSeek,
}: UseSeekPreviewOptions) {
  const seekTrackRef = useRef<HTMLDivElement>(null);
  const previewTooltipRef = useRef<HTMLDivElement>(null);
  const [dragSeekTime, setDragSeekTime] = useState<number | null>(null);
  const [hoverSeekTime, setHoverSeekTime] = useState<number | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [previewWidth, setPreviewWidth] = useState(0);

  const seekTime = dragSeekTime ?? currentTime;
  const previewTime = dragSeekTime ?? hoverSeekTime;
  const frameStyle =
    seekThumbnail !== undefined && previewTime !== null
      ? computeSeekThumbnailFrameStyle(previewTime, seekThumbnail.manifest, seekThumbnail.spriteUrl)
      : null;
  const isPreviewActive = previewTime !== null;
  const hasPreviewThumbnail = frameStyle !== null;
  const previewLeftPx =
    previewTime !== null && previewWidth > 0
      ? computeSeekPreviewLeftPx({
          time: previewTime,
          duration,
          trackWidth,
          previewWidth,
        })
      : null;
  const isPreviewVisible = previewTime !== null && previewLeftPx !== null;

  const syncPreviewWidth = useCallback(() => {
    const tooltip = previewTooltipRef.current;
    if (!tooltip) {
      return;
    }

    setPreviewWidth(tooltip.getBoundingClientRect().width);
  }, []);

  const syncTrackWidth = () => {
    const track = seekTrackRef.current;
    if (!track) {
      return;
    }

    setTrackWidth(track.getBoundingClientRect().width);
  };

  useEffect(() => {
    const track = seekTrackRef.current;
    if (!track) {
      return;
    }

    syncTrackWidth();

    const observer = new ResizeObserver(syncTrackWidth);
    observer.observe(track);
    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    syncPreviewWidth();
  }, [isPreviewActive, hasPreviewThumbnail, syncPreviewWidth]);

  useEffect(() => {
    const tooltip = previewTooltipRef.current;
    if (!tooltip) {
      return;
    }

    const observer = new ResizeObserver(syncPreviewWidth);
    observer.observe(tooltip);
    return () => {
      observer.disconnect();
    };
  }, [syncPreviewWidth]);

  const onSeekHoverMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }

    const track = seekTrackRef.current;
    if (!track || duration <= 0) {
      return;
    }

    const rect = track.getBoundingClientRect();
    const time = computeSeekPreviewTimeFromPointer({
      clientX: event.clientX,
      trackLeft: rect.left,
      trackWidth: rect.width,
      duration,
    });

    if (time !== null) {
      setHoverSeekTime(time);
    }
  };

  const onSeekHoverEnd = () => {
    setHoverSeekTime(null);
  };

  const onSeekDragEnd = () => {
    setDragSeekTime(null);
    onSeekHoverEnd();
  };

  return {
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
    onSeekValueChange: (values: number[]) => {
      if (duration <= 0) {
        return;
      }

      setDragSeekTime(values[0] ?? 0);
    },
    onSeekValueCommit: (values: number[]) => {
      if (duration <= 0) {
        return;
      }

      setDragSeekTime(null);
      onSeek(values[0] ?? 0);
    },
  };
}

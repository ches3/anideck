export type SeekThumbnailManifest = {
  intervalSec: number;
  count: number;
  thumbnail: {
    width: number;
    height: number;
  };
  sprite: {
    columns: number;
    rows: number;
  };
};

export type SeekThumbnailFrameStyle = {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundRepeat: "no-repeat";
  backgroundSize: string;
};

export function buildSeekThumbnailSpriteUrl(workId: string, episodeId: string): string {
  const encodedWorkId = encodeURIComponent(workId);
  const encodedEpisodeId = encodeURIComponent(episodeId);
  return `/api/works/${encodedWorkId}/episodes/${encodedEpisodeId}/seek-thumbnails/sprite.webp`;
}

export function computeSeekPreviewTimeFromPointer(input: {
  clientX: number;
  trackLeft: number;
  trackWidth: number;
  duration: number;
}): number | null {
  const { clientX, trackLeft, trackWidth, duration } = input;

  if (!Number.isFinite(duration) || duration <= 0 || trackWidth <= 0) {
    return null;
  }

  const ratio = Math.min(Math.max((clientX - trackLeft) / trackWidth, 0), 1);
  return ratio * duration;
}

export function computeSeekPreviewLeftPx(input: {
  time: number;
  duration: number;
  trackWidth: number;
  previewWidth: number;
}): number | null {
  const { time, duration, trackWidth, previewWidth } = input;

  if (
    !Number.isFinite(time) ||
    !Number.isFinite(duration) ||
    !Number.isFinite(trackWidth) ||
    !Number.isFinite(previewWidth) ||
    duration <= 0 ||
    trackWidth <= 0 ||
    previewWidth <= 0
  ) {
    return null;
  }

  const centerX = (time / duration) * trackWidth;
  const halfWidth = previewWidth / 2;

  if (trackWidth <= previewWidth) {
    return Math.round(trackWidth / 2);
  }

  return Math.round(Math.min(Math.max(centerX, halfWidth), trackWidth - halfWidth));
}

export function computeSeekThumbnailFrameIndex(
  timeSec: number,
  manifest: SeekThumbnailManifest,
): number | null {
  if (!Number.isFinite(timeSec) || timeSec < 0) {
    return null;
  }

  const index = Math.min(Math.floor(timeSec / manifest.intervalSec), manifest.count - 1);

  return index >= 0 ? index : null;
}

export function computeSeekThumbnailFrameStyle(
  timeSec: number,
  manifest: SeekThumbnailManifest,
  spriteUrl: string,
): SeekThumbnailFrameStyle | null {
  const index = computeSeekThumbnailFrameIndex(timeSec, manifest);
  if (index === null) {
    return null;
  }

  const column = index % manifest.sprite.columns;
  const row = Math.floor(index / manifest.sprite.columns);
  const { columns, rows } = manifest.sprite;
  const positionX = columns <= 1 ? 0 : (column / (columns - 1)) * 100;
  const positionY = rows <= 1 ? 0 : (row / (rows - 1)) * 100;

  return {
    backgroundImage: `url("${spriteUrl}")`,
    backgroundPosition: `${positionX}% ${positionY}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${columns * 100}% ${rows * 100}%`,
  };
}

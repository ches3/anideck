import * as v from "valibot";

export const SEEK_THUMBNAIL_INTERVAL_SEC = 10;
export const SEEK_THUMBNAIL_THUMB_WIDTH = 320;
export const SEEK_THUMBNAIL_COLUMNS = 10;

export const seekThumbnailManifestSchema = v.object({
  intervalSec: v.literal(SEEK_THUMBNAIL_INTERVAL_SEC),
  count: v.pipe(v.number(), v.integer(), v.minValue(1)),
  thumbnail: v.object({
    width: v.literal(SEEK_THUMBNAIL_THUMB_WIDTH),
    height: v.pipe(v.number(), v.integer(), v.minValue(2)),
  }),
  sprite: v.object({
    columns: v.literal(SEEK_THUMBNAIL_COLUMNS),
    rows: v.pipe(v.number(), v.integer(), v.minValue(1)),
  }),
});

export type SeekThumbnailManifest = v.InferOutput<typeof seekThumbnailManifestSchema>;

export function computeSeekThumbnailCount(durationSec: number): number {
  return Math.ceil(durationSec / SEEK_THUMBNAIL_INTERVAL_SEC);
}

export function computeSeekThumbnailRows(count: number): number {
  return Math.ceil(count / SEEK_THUMBNAIL_COLUMNS);
}

export function computeSeekThumbnailHeight(videoWidth: number, videoHeight: number): number {
  const scaled = (SEEK_THUMBNAIL_THUMB_WIDTH * videoHeight) / videoWidth;
  return Math.ceil(scaled / 2) * 2;
}

export function buildSeekThumbnailManifest(input: {
  durationSec: number;
  videoWidth: number;
  videoHeight: number;
}): SeekThumbnailManifest {
  const count = computeSeekThumbnailCount(input.durationSec);
  const rows = computeSeekThumbnailRows(count);

  return {
    intervalSec: SEEK_THUMBNAIL_INTERVAL_SEC,
    count,
    thumbnail: {
      width: SEEK_THUMBNAIL_THUMB_WIDTH,
      height: computeSeekThumbnailHeight(input.videoWidth, input.videoHeight),
    },
    sprite: {
      columns: SEEK_THUMBNAIL_COLUMNS,
      rows,
    },
  };
}

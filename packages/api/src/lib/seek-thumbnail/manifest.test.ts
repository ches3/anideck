import * as v from "valibot";
import { describe, expect, it } from "vite-plus/test";

import {
  buildSeekThumbnailManifest,
  computeSeekThumbnailCount,
  computeSeekThumbnailHeight,
  computeSeekThumbnailRows,
  SEEK_THUMBNAIL_COLUMNS,
  SEEK_THUMBNAIL_INTERVAL_SEC,
  SEEK_THUMBNAIL_THUMB_WIDTH,
  seekThumbnailManifestSchema,
} from "./manifest.ts";

describe("computeSeekThumbnailCount", () => {
  const intervalSec = SEEK_THUMBNAIL_INTERVAL_SEC;

  it("duration が intervalSec 未満の場合は 1 を返す", () => {
    expect(computeSeekThumbnailCount(intervalSec - 0.1)).toBe(1);
  });

  it("duration が intervalSec と等しい場合は 1 を返す", () => {
    expect(computeSeekThumbnailCount(intervalSec)).toBe(1);
  });

  it("duration が intervalSec を超える場合は 2 を返す", () => {
    expect(computeSeekThumbnailCount(intervalSec + 0.1)).toBe(2);
  });

  it("duration が intervalSec の倍数の場合はその倍数を返す", () => {
    const multiplier = 10;

    expect(computeSeekThumbnailCount(intervalSec * multiplier)).toBe(multiplier);
  });
});

describe("computeSeekThumbnailRows", () => {
  const columns = SEEK_THUMBNAIL_COLUMNS;

  it("count が 1 の場合は 1 を返す", () => {
    expect(computeSeekThumbnailRows(1)).toBe(1);
  });

  it("count が columns と等しい場合は 1 を返す", () => {
    expect(computeSeekThumbnailRows(columns)).toBe(1);
  });

  it("count が columns を 1 超える場合は 2 を返す", () => {
    expect(computeSeekThumbnailRows(columns + 1)).toBe(2);
  });

  it("count が columns の倍数の場合は count / columns を返す", () => {
    const multiplier = 3;

    expect(computeSeekThumbnailRows(columns * multiplier)).toBe(multiplier);
  });
});

describe("computeSeekThumbnailHeight", () => {
  it("偶数かつ 2 以上の高さを返す", () => {
    for (const [videoWidth, videoHeight] of [
      [1920, 1080],
      [1280, 720],
      [1000, 335],
    ] as const) {
      const height = computeSeekThumbnailHeight(videoWidth, videoHeight);

      expect(height % 2).toBe(0);
      expect(height).toBeGreaterThanOrEqual(2);
    }
  });

  it("解像度が異なる場合でもアスペクト比が同じであれば同一の高さを返す", () => {
    expect(computeSeekThumbnailHeight(1920, 1080)).toBe(computeSeekThumbnailHeight(1280, 720));
  });

  it("サムネイルのアスペクト比は元動画と一致する", () => {
    const videoWidth = 1920;
    const videoHeight = 1080;
    const height = computeSeekThumbnailHeight(videoWidth, videoHeight);

    expect(height / SEEK_THUMBNAIL_THUMB_WIDTH).toBeCloseTo(videoHeight / videoWidth);
  });

  it("スケール後の高さが奇数の場合は偶数に切り上げる", () => {
    const videoWidth = 1000;
    const videoHeight = 335;
    const scaled = (SEEK_THUMBNAIL_THUMB_WIDTH * videoHeight) / videoWidth;
    const height = computeSeekThumbnailHeight(videoWidth, videoHeight);

    expect(height % 2).toBe(0);
    expect(height).toBeGreaterThanOrEqual(scaled);
    expect(height - scaled).toBeLessThan(2);
  });
});

describe("buildSeekThumbnailManifest", () => {
  const intervalSec = SEEK_THUMBNAIL_INTERVAL_SEC;
  const columns = SEEK_THUMBNAIL_COLUMNS;

  it("duration が intervalSec の場合は count 1・rows 1 の manifest を返す", () => {
    const videoWidth = 1920;
    const videoHeight = 1080;
    const manifest = buildSeekThumbnailManifest({
      durationSec: intervalSec,
      videoWidth,
      videoHeight,
    });

    expect(manifest.intervalSec).toBe(intervalSec);
    expect(manifest.count).toBe(1);
    expect(manifest.thumbnail.width).toBe(SEEK_THUMBNAIL_THUMB_WIDTH);
    expect(manifest.thumbnail.height / SEEK_THUMBNAIL_THUMB_WIDTH).toBeCloseTo(
      videoHeight / videoWidth,
    );
    expect(manifest.sprite).toEqual({ columns, rows: 1 });
  });

  it("複数 intervalSec の duration から sprite 行数が count を収容する manifest を返す", () => {
    const countMultiplier = 10;
    const durationSec = intervalSec * countMultiplier + 0.1;
    const manifest = buildSeekThumbnailManifest({
      durationSec,
      videoWidth: 1920,
      videoHeight: 1080,
    });

    expect(manifest.intervalSec).toBe(intervalSec);
    expect(manifest.count).toBe(countMultiplier + 1);
    expect(manifest.thumbnail.width).toBe(SEEK_THUMBNAIL_THUMB_WIDTH);
    expect(manifest.sprite.columns).toBe(columns);
    expect(manifest.sprite.rows * columns).toBeGreaterThanOrEqual(manifest.count);
    expect((manifest.sprite.rows - 1) * columns).toBeLessThan(manifest.count);
  });

  it("返却値は seekThumbnailManifestSchema に適合する", () => {
    const manifest = buildSeekThumbnailManifest({
      durationSec: intervalSec * 3 + 0.1,
      videoWidth: 1000,
      videoHeight: 335,
    });

    expect(v.parse(seekThumbnailManifestSchema, manifest)).toEqual(manifest);
  });
});

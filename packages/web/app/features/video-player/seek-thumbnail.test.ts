import { describe, expect, it } from "vite-plus/test";

import {
  computeSeekPreviewLeftPx,
  computeSeekPreviewTimeFromPointer,
  computeSeekThumbnailFrameIndex,
  computeSeekThumbnailFrameStyle,
  type SeekThumbnailManifest,
} from "./seek-thumbnail";

const sampleManifest: SeekThumbnailManifest = {
  intervalSec: 10,
  count: 144,
  thumbnail: { width: 240, height: 136 },
  sprite: { columns: 10, rows: 15 },
};

const intervalSec = sampleManifest.intervalSec;
const lastIndex = sampleManifest.count - 1;

describe("computeSeekPreviewTimeFromPointer()", () => {
  it("ポインター位置のシークバー幅に対する比率に duration を乗算した値を返す", () => {
    expect(
      computeSeekPreviewTimeFromPointer({
        clientX: 150,
        trackLeft: 100,
        trackWidth: 100,
        duration: 120,
      }),
    ).toBe(60);
  });

  it("duration が 0 以下の場合は null を返す", () => {
    expect(
      computeSeekPreviewTimeFromPointer({
        clientX: 150,
        trackLeft: 100,
        trackWidth: 100,
        duration: 0,
      }),
    ).toBeNull();
  });
});

describe("computeSeekPreviewLeftPx()", () => {
  const duration = 120;

  it("シークバー中央付近ではクランプしない", () => {
    expect(
      computeSeekPreviewLeftPx({
        time: 60,
        duration,
        trackWidth: 400,
        previewWidth: 240,
      }),
    ).toBe(200);
  });

  it("シークバー左端付近ではクランプする", () => {
    expect(
      computeSeekPreviewLeftPx({
        time: 0,
        duration,
        trackWidth: 400,
        previewWidth: 240,
      }),
    ).toBe(120);
  });

  it("シークバー右端付近ではクランプする", () => {
    expect(
      computeSeekPreviewLeftPx({
        time: 120,
        duration,
        trackWidth: 400,
        previewWidth: 240,
      }),
    ).toBe(280);
  });

  it("プレビュー幅がシークバー幅以上の場合はシークバー中央に配置する", () => {
    expect(
      computeSeekPreviewLeftPx({
        time: 12,
        duration,
        trackWidth: 200,
        previewWidth: 240,
      }),
    ).toBe(100);
  });

  it("duration が 0 以下の場合は null を返す", () => {
    expect(
      computeSeekPreviewLeftPx({
        time: 30,
        duration: 0,
        trackWidth: 400,
        previewWidth: 240,
      }),
    ).toBeNull();
  });
});

describe("computeSeekThumbnailFrameIndex()", () => {
  it("timeSec が 0 の場合は 0 を返す", () => {
    expect(computeSeekThumbnailFrameIndex(0, sampleManifest)).toBe(0);
  });

  it("timeSec が intervalSec の場合は 1 を返す", () => {
    expect(computeSeekThumbnailFrameIndex(intervalSec, sampleManifest)).toBe(1);
  });

  it("timeSec が manifest の範囲を超える場合は最後の index を返す", () => {
    expect(computeSeekThumbnailFrameIndex(intervalSec * lastIndex + 999, sampleManifest)).toBe(
      lastIndex,
    );
  });

  it("timeSec が有限値でない場合は null を返す", () => {
    expect(computeSeekThumbnailFrameIndex(Number.NaN, sampleManifest)).toBeNull();
  });
});

describe("computeSeekThumbnailFrameStyle()", () => {
  it("timeSec に対応する sprite 画像の CSS background プロパティを返す", () => {
    expect(computeSeekThumbnailFrameStyle(25, sampleManifest, "/sprite.webp")).toEqual({
      backgroundImage: 'url("/sprite.webp")',
      backgroundPosition: "22.22222222222222% 0%",
      backgroundRepeat: "no-repeat",
      backgroundSize: "1000% 1500%",
    });
  });
});

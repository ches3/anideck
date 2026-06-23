import { describe, expect, it } from "vite-plus/test";

import { parseFfprobeOutput } from "./ffprobe.ts";

describe("parseFfprobeOutput", () => {
  it("映像ストリームと duration からメタデータを返す", () => {
    expect(
      parseFfprobeOutput({
        streams: [{ width: 1920, height: 1080 }],
        format: { duration: "1440.5" },
      }),
    ).toEqual({
      durationSec: 1440.5,
      width: 1920,
      height: 1080,
    });
  });

  it("映像ストリームがない場合はエラーにする", () => {
    expect(() =>
      parseFfprobeOutput({
        streams: [],
        format: { duration: "10" },
      }),
    ).toThrow("動画のメタデータを取得できませんでした");
  });

  it("duration が不正な場合はエラーにする", () => {
    expect(() =>
      parseFfprobeOutput({
        streams: [{ width: 1920, height: 1080 }],
        format: { duration: "0" },
      }),
    ).toThrow("動画のメタデータを取得できませんでした");
  });
});

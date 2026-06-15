import { describe, expect, it } from "vite-plus/test";

import { formatDuration } from "./utils";

describe("formatDuration()", () => {
  it("負数や非有限値の場合は `0:00` を返す", () => {
    expect(formatDuration(-1)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });

  it("1 時間未満の場合は `分:秒` の形式で返す", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(90)).toBe("1:30");
  });

  it("小数秒は切り捨てて返す", () => {
    expect(formatDuration(65.9)).toBe("1:05");
  });

  it("1 時間以上の場合は `時:分:秒` の形式で返す", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });
});

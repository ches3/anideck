import { describe, expect, it } from "vite-plus/test";

import { createEpisodeId, createWorkId } from "./work-id.ts";

describe("createWorkId", () => {
  it("rootId と workTitle が同じである場合は同一の ID を生成する", () => {
    expect(createWorkId("ROOT1", "Series A")).toBe(createWorkId("ROOT1", "Series A"));
  });

  it("workTitle が異なる場合は異なる ID を生成する", () => {
    expect(createWorkId("ROOT1", "Series A")).not.toBe(createWorkId("ROOT1", "Series B"));
  });

  it("rootId が異なる場合は同一 workTitle でも異なる ID を生成する", () => {
    expect(createWorkId("ROOT1", "Series A")).not.toBe(createWorkId("ROOT2", "Series A"));
  });

  it("22文字の base64url 文字列を返す", () => {
    const id = createWorkId("ROOT1", "Series A");
    expect(id).toHaveLength(22);
    expect(id).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("createEpisodeId", () => {
  it("同じ rootId と relativePath から同じ ID を生成する", () => {
    expect(createEpisodeId("ROOT1", "Series/#01.mp4")).toBe(
      createEpisodeId("ROOT1", "Series/#01.mp4"),
    );
  });

  it("rootId または relativePath が異なれば異なる ID を生成する", () => {
    const base = createEpisodeId("ROOT1", "Series/#01.mp4");
    expect(createEpisodeId("ROOT2", "Series/#01.mp4")).not.toBe(base);
    expect(createEpisodeId("ROOT1", "Series/#02.mp4")).not.toBe(base);
  });
});

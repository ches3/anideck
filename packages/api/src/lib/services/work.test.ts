import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { createTestDb } from "../db/test-helper.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import { listSourceFiles } from "./source-file.ts";
import { listSourceRoots } from "./source-root.ts";
import { getWork, listWorks } from "./work.ts";

vi.mock("./source-root.ts");
vi.mock("./source-file.ts");

describe("listWorks", () => {
  let db: Db;

  beforeEach(async () => {
    vi.resetAllMocks();
    ({ db } = await createTestDb());
  });

  it("全 source root のファイルから work title を重複排除して返す", async () => {
    vi.mocked(listSourceRoots).mockResolvedValue([
      { id: "ROOT1", path: "/media/anime1" },
      { id: "ROOT2", path: "/media/anime2" },
    ]);
    vi.mocked(listSourceFiles)
      .mockResolvedValueOnce([
        {
          relativePath: "Series A/#01.mp4",
          title: { work: "Series A", episode: "#01" },
        },
        {
          relativePath: "Series A/#02.mp4",
          title: { work: "Series A", episode: "#02" },
        },
      ])
      .mockResolvedValueOnce([
        {
          relativePath: "Series A/#03.mp4",
          title: { work: "Series A", episode: "#03" },
        },
        {
          relativePath: "Series B/#01.mp4",
          title: { work: "Series B", episode: "#01" },
        },
      ]);

    const works = await listWorks(db);

    expect(works).toEqual([
      { id: createWorkId("Series A"), title: "Series A" },
      { id: createWorkId("Series B"), title: "Series B" },
    ]);
    expect(listSourceFiles).toHaveBeenCalledTimes(2);
  });

  it("title が解決できないファイルは除外する", async () => {
    vi.mocked(listSourceRoots).mockResolvedValue([{ id: "ROOT1", path: "/media/anime" }]);
    vi.mocked(listSourceFiles).mockResolvedValue([
      {
        relativePath: "Series A/#01.mp4",
        title: { work: "Series A", episode: "#01" },
      },
      {
        relativePath: "unknown.mp4",
        title: null,
      },
    ]);

    const works = await listWorks(db);

    expect(works).toEqual([{ id: createWorkId("Series A"), title: "Series A" }]);
  });
});

describe("getWork", () => {
  let db: Db;

  beforeEach(async () => {
    vi.resetAllMocks();
    ({ db } = await createTestDb());
  });

  it("指定した workId に一致する episodes を返す", async () => {
    const workId = createWorkId("Series A");
    vi.mocked(listSourceRoots).mockResolvedValue([
      { id: "ROOT1", path: "/media/anime1" },
      { id: "ROOT2", path: "/media/anime2" },
    ]);
    vi.mocked(listSourceFiles)
      .mockResolvedValueOnce([
        {
          relativePath: "Series A/#01.mp4",
          title: { work: "Series A", episode: "#01" },
        },
        {
          relativePath: "Series B/#01.mp4",
          title: { work: "Series B", episode: "#01" },
        },
      ])
      .mockResolvedValueOnce([
        {
          relativePath: "Series A/#02.mp4",
          title: { work: "Series A", episode: "#02" },
        },
      ]);

    const work = await getWork(db, workId);

    expect(work).toEqual({
      id: workId,
      title: "Series A",
      episodes: [
        {
          id: createEpisodeId("ROOT1", "Series A/#01.mp4"),
          title: "#01",
          path: join("/media/anime1", "Series A/#01.mp4"),
        },
        {
          id: createEpisodeId("ROOT2", "Series A/#02.mp4"),
          title: "#02",
          path: join("/media/anime2", "Series A/#02.mp4"),
        },
      ],
    });
  });

  it("title が解決できないファイルは episodes から除外する", async () => {
    const workId = createWorkId("Series A");
    vi.mocked(listSourceRoots).mockResolvedValue([{ id: "ROOT1", path: "/media/anime" }]);
    vi.mocked(listSourceFiles).mockResolvedValue([
      {
        relativePath: "Series A/#01.mp4",
        title: { work: "Series A", episode: "#01" },
      },
      {
        relativePath: "Series A/unknown.mp4",
        title: null,
      },
    ]);

    const work = await getWork(db, workId);

    expect(work.episodes).toHaveLength(1);
    expect(work.episodes[0]?.title).toBe("#01");
  });

  it("一致する work がない場合は NotFoundError を投げる", async () => {
    vi.mocked(listSourceRoots).mockResolvedValue([{ id: "ROOT1", path: "/media/anime" }]);
    vi.mocked(listSourceFiles).mockResolvedValue([
      {
        relativePath: "Series A/#01.mp4",
        title: { work: "Series A", episode: "#01" },
      },
    ]);

    await expect(getWork(db, "missing-work-id")).rejects.toBeInstanceOf(NotFoundError);
  });
});

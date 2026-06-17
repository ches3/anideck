import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { episodes, sourceRoots, works } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import { getWork, getWorkEpisode, listWorks } from "./work.ts";

const ROOT1_ID = "ROOT1";
const ROOT2_ID = "ROOT2";

async function seedCatalog(db: Db): Promise<void> {
  await db.insert(sourceRoots).values([
    { id: ROOT1_ID, path: "/media/anime1" },
    { id: ROOT2_ID, path: "/media/anime2" },
  ]);
  await db.insert(works).values([
    {
      id: createWorkId(ROOT1_ID, "Series A"),
      rootId: ROOT1_ID,
      originalTitle: "Series A",
    },
    {
      id: createWorkId(ROOT2_ID, "Series A"),
      rootId: ROOT2_ID,
      originalTitle: "Series A",
    },
    {
      id: createWorkId(ROOT1_ID, "Series B"),
      rootId: ROOT1_ID,
      originalTitle: "Series B",
    },
    {
      id: createWorkId(ROOT1_ID, "Inactive Work"),
      rootId: ROOT1_ID,
      originalTitle: "Inactive Work",
    },
  ]);
  await db.insert(episodes).values([
    {
      id: createEpisodeId(ROOT1_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT1_ID, "Series A"),
      rootId: ROOT1_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: true,
    },
    {
      id: createEpisodeId(ROOT1_ID, "Series A/#02.mp4"),
      workId: createWorkId(ROOT1_ID, "Series A"),
      rootId: ROOT1_ID,
      relativePath: "Series A/#02.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#02",
      active: true,
    },
    {
      id: createEpisodeId(ROOT2_ID, "Series A/#03.mp4"),
      workId: createWorkId(ROOT2_ID, "Series A"),
      rootId: ROOT2_ID,
      relativePath: "Series A/#03.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#03",
      active: true,
    },
    {
      id: createEpisodeId(ROOT1_ID, "Series B/#01.mp4"),
      workId: createWorkId(ROOT1_ID, "Series B"),
      rootId: ROOT1_ID,
      relativePath: "Series B/#01.mp4",
      originalWorkTitle: "Series B",
      originalTitle: "#01",
      active: true,
    },
    {
      id: createEpisodeId(ROOT1_ID, "Series A/inactive.mp4"),
      workId: createWorkId(ROOT1_ID, "Series A"),
      rootId: ROOT1_ID,
      relativePath: "Series A/inactive.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "inactive",
      active: false,
    },
  ]);
}

describe("listWorks", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await seedCatalog(db);
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("active な work のみをタイトル順で返す", async () => {
    const result = await listWorks(db);

    expect(result).toEqual([
      { id: createWorkId(ROOT1_ID, "Series A"), title: "Series A" },
      { id: createWorkId(ROOT2_ID, "Series A"), title: "Series A" },
      { id: createWorkId(ROOT1_ID, "Series B"), title: "Series B" },
    ]);
  });

  it("inactive な work は一覧に含めない", async () => {
    const result = await listWorks(db);

    expect(result.some((work) => work.title === "Inactive Work")).toBe(false);
  });
});

describe("getWork", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await seedCatalog(db);
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("指定した work の active な episode を path 付きで返す", async () => {
    const workId = createWorkId(ROOT1_ID, "Series A");

    const work = await getWork(db, workId);

    expect(work).toEqual({
      id: workId,
      title: "Series A",
      episodes: [
        {
          id: createEpisodeId(ROOT1_ID, "Series A/#01.mp4"),
          title: "#01",
          path: join("/media/anime1", "Series A/#01.mp4"),
        },
        {
          id: createEpisodeId(ROOT1_ID, "Series A/#02.mp4"),
          title: "#02",
          path: join("/media/anime1", "Series A/#02.mp4"),
        },
      ],
    });
  });

  it("episodes を title の localeCompare（numeric）でソートして返す", async () => {
    const workId = createWorkId(ROOT1_ID, "Sort Test");
    await db.insert(works).values({
      id: workId,
      rootId: ROOT1_ID,
      originalTitle: "Sort Test",
    });
    await db.insert(episodes).values([
      {
        id: createEpisodeId(ROOT1_ID, "Sort Test/#02.mp4"),
        workId,
        rootId: ROOT1_ID,
        relativePath: "Sort Test/#02.mp4",
        originalWorkTitle: "Sort Test",
        originalTitle: "#02",
        active: true,
      },
      {
        id: createEpisodeId(ROOT1_ID, "Sort Test/#10.mp4"),
        workId,
        rootId: ROOT1_ID,
        relativePath: "Sort Test/#10.mp4",
        originalWorkTitle: "Sort Test",
        originalTitle: "#10",
        active: true,
      },
      {
        id: createEpisodeId(ROOT1_ID, "Sort Test/#2.mp4"),
        workId,
        rootId: ROOT1_ID,
        relativePath: "Sort Test/#2.mp4",
        originalWorkTitle: "Sort Test",
        originalTitle: "#2",
        active: true,
      },
      {
        id: createEpisodeId(ROOT1_ID, "Sort Test/#01.mp4"),
        workId,
        rootId: ROOT1_ID,
        relativePath: "Sort Test/#01.mp4",
        originalWorkTitle: "Sort Test",
        originalTitle: "#01",
        active: true,
      },
    ]);

    const work = await getWork(db, workId);

    expect(work.episodes.map((episode) => episode.title)).toEqual(["#01", "#02", "#2", "#10"]);
  });

  it("inactive な episode は episodes から除外する", async () => {
    const work = await getWork(db, createWorkId(ROOT1_ID, "Series A"));

    expect(work.episodes.some((episode) => episode.title === "inactive")).toBe(false);
  });

  it("inactive な work の取得は NotFoundError を投げる", async () => {
    await expect(getWork(db, createWorkId(ROOT1_ID, "Inactive Work"))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("一致する work がない場合は NotFoundError を投げる", async () => {
    await expect(getWork(db, "missing-work-id")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getWorkEpisode", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await seedCatalog(db);
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("指定した work と episode に一致する active な episode を返す", async () => {
    const workId = createWorkId(ROOT1_ID, "Series A");
    const episodeId = createEpisodeId(ROOT1_ID, "Series A/#01.mp4");

    const detail = await getWorkEpisode(db, workId, episodeId);

    expect(detail).toEqual({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: join("/media/anime1", "Series A/#01.mp4"),
      },
    });
  });

  it("root と relativePath が異なれば同じ episode title でも別 episode として取得できる", async () => {
    const workId = createWorkId(ROOT2_ID, "Series A");
    const episodeId = createEpisodeId(ROOT2_ID, "Series A/#03.mp4");

    const detail = await getWorkEpisode(db, workId, episodeId);

    expect(detail.episode.path).toBe(join("/media/anime2", "Series A/#03.mp4"));
  });

  it("inactive な episode の取得は NotFoundError を投げる", async () => {
    const workId = createWorkId(ROOT1_ID, "Series A");
    const episodeId = createEpisodeId(ROOT1_ID, "Series A/inactive.mp4");

    await expect(getWorkEpisode(db, workId, episodeId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("指定 work に属さない episodeId の取得は NotFoundError を投げる", async () => {
    const workId = createWorkId(ROOT1_ID, "Series A");
    const episodeId = createEpisodeId(ROOT1_ID, "Series B/#01.mp4");

    await expect(getWorkEpisode(db, workId, episodeId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("存在しない episodeId の取得は NotFoundError を投げる", async () => {
    const workId = createWorkId(ROOT1_ID, "Series A");

    await expect(getWorkEpisode(db, workId, "missing-episode-id")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

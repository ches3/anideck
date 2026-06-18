import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { episodes, sourceRoots, works } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import {
  applyCatalogDiff,
  buildScannedEpisodeMap,
  syncAllSourceRootCatalogs,
  syncSourceRootCatalog,
} from "./catalog-sync.ts";
import { listSourceFiles } from "./source-file.ts";
import { getWork, listWorks } from "./work.ts";

vi.mock("./source-file.ts", () => ({
  listSourceFiles: vi.fn(),
}));

const ROOT_ID = "ROOT1";
const ANNICT_SKIPPED = { status: "skipped", reason: "missing_token" } as const;

function scannedEpisode(input: {
  relativePath: string;
  originalWorkTitle: string;
  originalTitle: string;
}) {
  return {
    rootId: ROOT_ID,
    relativePath: input.relativePath,
    originalWorkTitle: input.originalWorkTitle,
    originalTitle: input.originalTitle,
  };
}

async function seedSourceRoot(db: Db): Promise<void> {
  await db.insert(sourceRoots).values({
    id: ROOT_ID,
    path: "/media/anime",
  });
}

async function runSync(db: Db, scanned: ReturnType<typeof scannedEpisode>[]) {
  return applyCatalogDiff(
    db,
    ROOT_ID,
    buildScannedEpisodeMap(
      ROOT_ID,
      scanned.map((episode) => ({
        relativePath: episode.relativePath,
        title: {
          work: episode.originalWorkTitle,
          episode: episode.originalTitle,
        },
      })),
    ),
  );
}

describe("applyCatalogDiff", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await seedSourceRoot(db);
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("スキャン結果に含まれているが DB に存在しないファイルは新規追加する", async () => {
    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
    ]);

    const rows = await db.select().from(episodes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      active: true,
      originalWorkTitle: "Series A",
      originalTitle: "#01",
    });
  });

  it("同一のファイルが複数存在する場合は 1 件のみ追加する", async () => {
    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01 duplicate",
      }),
    ]);

    const rows = await db.select().from(episodes);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      relativePath: "Series A/#01.mp4",
      originalTitle: "#01 duplicate",
    });
  });

  it("スキャン結果に含まれていない active なエピソードを inactive にする", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: true,
    });

    await runSync(db, []);
    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(row?.active).toBe(false);
  });

  it("inactive なエピソードがスキャン結果に含まれている場合は active にしてタイトルを更新する", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01 old",
      active: false,
    });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01 new",
      }),
    ]);

    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(row).toMatchObject({
      active: true,
      originalTitle: "#01 new",
    });
  });

  it("inactive なエピソードが同じタイトルで復帰した場合は Annict データを維持する", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: false,
      annictStatus: "matched",
      annictTitle: "Annict Episode",
      annictEpisodeId: "episode-1",
      annictEpisodeNumber: 1,
      annictEpisodeNumberText: "#01",
      annictNoEpisodes: false,
    });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
    ]);

    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(row).toMatchObject({
      active: true,
      annictStatus: "matched",
      annictTitle: "Annict Episode",
      annictEpisodeId: "episode-1",
      annictEpisodeNumber: 1,
      annictEpisodeNumberText: "#01",
      annictNoEpisodes: false,
    });
  });

  it("inactive なエピソードが別タイトルで復帰した場合は Annict データをクリアする", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01 old",
      active: false,
      annictStatus: "matched",
      annictTitle: "Annict Episode",
      annictEpisodeId: "episode-1",
      annictEpisodeNumber: 1,
      annictEpisodeNumberText: "#01",
      annictNoEpisodes: false,
    });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01 new",
      }),
    ]);

    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(row).toMatchObject({
      active: true,
      originalTitle: "#01 new",
      annictEpisodeId: null,
      annictTitle: null,
      annictEpisodeNumber: null,
      annictEpisodeNumberText: null,
      annictNoEpisodes: null,
      annictStatus: null,
    });
  });

  it("タイトルに変更がない episode は更新しない", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: true,
    });

    const before = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    const previousUpdatedAt = before?.updatedAt;

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
    ]);

    const after = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(after?.updatedAt.getTime()).toBe(previousUpdatedAt?.getTime());
  });

  it("作品タイトルが変わったエピソードは紐づく work を付け替える", async () => {
    await db.insert(works).values([
      {
        id: createWorkId(ROOT_ID, "Series A"),
        rootId: ROOT_ID,
        originalTitle: "Series A",
      },
      {
        id: createWorkId(ROOT_ID, "Series B"),
        rootId: ROOT_ID,
        originalTitle: "Series B",
      },
    ]);
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: true,
    });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series B",
        originalTitle: "#01",
      }),
    ]);

    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(row).toMatchObject({
      workId: createWorkId(ROOT_ID, "Series B"),
      originalWorkTitle: "Series B",
    });

    const listedWorks = await listWorks(db);
    expect(listedWorks.some((work) => work.title === "Series A")).toBe(false);
    await expect(getWork(db, createWorkId(ROOT_ID, "Series A"))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("タイトルのみが変わったエピソードはタイトルを更新する", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01 old",
      active: true,
    });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01 new",
      }),
    ]);

    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(row?.originalTitle).toBe("#01 new");
  });

  it("タイトル変更時は Annict データをクリアする", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01 old",
      active: true,
      annictStatus: "matched",
      annictTitle: "Annict Episode",
      annictEpisodeId: "episode-1",
      annictEpisodeNumber: 1,
      annictEpisodeNumberText: "#01",
      annictNoEpisodes: false,
    });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01 new",
      }),
    ]);

    const row = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(row).toMatchObject({
      originalTitle: "#01 new",
      annictEpisodeId: null,
      annictTitle: null,
      annictEpisodeNumber: null,
      annictEpisodeNumberText: null,
      annictNoEpisodes: null,
      annictStatus: null,
    });
  });

  it("active なエピソードがなくなった作品は一覧に表示しない", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: true,
    });

    await runSync(db, []);

    const listedWorks = await listWorks(db);
    expect(listedWorks.some((work) => work.title === "Series A")).toBe(false);
  });

  it("inactive なエピソードが復帰した作品は一覧に表示する", async () => {
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: false,
    });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
    ]);

    const listedWorks = await listWorks(db);
    expect(listedWorks).toEqual([{ id: createWorkId(ROOT_ID, "Series A"), title: "Series A" }]);
  });

  it("他の source root に active なエピソードがある作品は一覧に表示し続ける", async () => {
    const root2Id = "ROOT2";
    await db.insert(sourceRoots).values({ id: root2Id, path: "/media/anime2" });
    await db.insert(works).values([
      {
        id: createWorkId(ROOT_ID, "Series A"),
        rootId: ROOT_ID,
        originalTitle: "Series A",
      },
      {
        id: createWorkId(root2Id, "Series A"),
        rootId: root2Id,
        originalTitle: "Series A",
      },
    ]);
    await db.insert(episodes).values([
      {
        id: createEpisodeId(ROOT_ID, "Series A/#01.mp4"),
        workId: createWorkId(ROOT_ID, "Series A"),
        rootId: ROOT_ID,
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
        active: true,
      },
      {
        id: createEpisodeId(root2Id, "Series A/#02.mp4"),
        workId: createWorkId(root2Id, "Series A"),
        rootId: root2Id,
        relativePath: "Series A/#02.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#02",
        active: true,
      },
    ]);

    await runSync(db, []);

    const listedWorks = await listWorks(db);
    expect(listedWorks).toEqual([{ id: createWorkId(root2Id, "Series A"), title: "Series A" }]);
  });

  it("複数 source root の同じ作品タイトルは root ごとに別作品として扱う", async () => {
    const root2Id = "ROOT2";
    await db.insert(sourceRoots).values({ id: root2Id, path: "/media/anime2" });

    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
    ]);
    await applyCatalogDiff(
      db,
      root2Id,
      buildScannedEpisodeMap(root2Id, [
        {
          relativePath: "Series A/#02.mp4",
          title: { work: "Series A", episode: "#02" },
        },
      ]),
    );

    const workRows = await db.select().from(works);
    expect(workRows).toHaveLength(2);
    expect(workRows.map((work) => work.id).sort()).toEqual(
      [createWorkId(ROOT_ID, "Series A"), createWorkId(root2Id, "Series A")].sort(),
    );

    const episodeRows = await db.select().from(episodes);
    expect(episodeRows).toHaveLength(2);
    expect(
      episodeRows.every((episode) => episode.workId === createWorkId(episode.rootId, "Series A")),
    ).toBe(true);
  });

  it("変更がない同期では DB を更新しない", async () => {
    const scanned = [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
    ];

    await runSync(db, scanned);
    const before = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    await runSync(db, scanned);

    const after = await db.query.episodes.findFirst({
      where: eq(episodes.id, createEpisodeId(ROOT_ID, "Series A/#01.mp4")),
    });
    expect(after?.updatedAt.getTime()).toBe(before?.updatedAt.getTime());
  });

  it("同期中にエラーが起きた場合は部分更新されない", async () => {
    await expect(
      db.transaction(async (tx) => {
        await applyCatalogDiff(
          tx,
          ROOT_ID,
          buildScannedEpisodeMap(ROOT_ID, [
            {
              relativePath: "Series A/#01.mp4",
              title: { work: "Series A", episode: "#01" },
            },
          ]),
        );
        throw new Error("sync failed");
      }),
    ).rejects.toThrow("sync failed");

    const episodeRows = await db.select().from(episodes);
    const workRows = await db.select().from(works);
    expect(episodeRows).toHaveLength(0);
    expect(workRows).toHaveLength(0);
  });

  it("作品の id は rootId と作品タイトルから生成する", async () => {
    await runSync(db, [
      scannedEpisode({
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      }),
    ]);

    const work = await db.query.works.findFirst({
      where: eq(works.id, createWorkId(ROOT_ID, "Series A")),
    });
    expect(work).toMatchObject({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
  });
});

describe("syncSourceRootCatalog", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = await createTestDb();
    db = testDb.db;
    await seedSourceRoot(db);
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("タイトルを解決できないファイルは同期対象から除外する", () => {
    const scanned = buildScannedEpisodeMap(ROOT_ID, [
      {
        relativePath: "Series A/#01.mp4",
        title: { work: "Series A", episode: "#01" },
      },
      {
        relativePath: "unknown.mp4",
        title: null,
      },
    ]);

    expect([...scanned.values()]).toEqual([
      {
        rootId: ROOT_ID,
        relativePath: "Series A/#01.mp4",
        originalWorkTitle: "Series A",
        originalTitle: "#01",
      },
    ]);
  });

  it("listSourceFiles の結果を同期する", async () => {
    vi.mocked(listSourceFiles).mockResolvedValue([
      {
        relativePath: "Series A/#01.mp4",
        title: { work: "Series A", episode: "#01" },
      },
    ]);

    const result = await syncSourceRootCatalog(db, ROOT_ID);

    expect(result).toEqual({ annict: ANNICT_SKIPPED });

    const rows = await db.select().from(episodes);
    expect(rows).toHaveLength(1);
    expect(listSourceFiles).toHaveBeenCalledWith(db, ROOT_ID);
  });
});

describe("syncAllSourceRootCatalogs", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("source root が 0 件の場合は空配列を返す", async () => {
    const result = await syncAllSourceRootCatalogs(db);

    expect(result).toEqual({ roots: [] });
    expect(listSourceFiles).not.toHaveBeenCalled();
  });

  it("複数 source root それぞれの同期結果を返す", async () => {
    const root2Id = "ROOT2";
    await db.insert(sourceRoots).values([
      { id: ROOT_ID, path: "/media/anime1" },
      { id: root2Id, path: "/media/anime2" },
    ]);

    vi.mocked(listSourceFiles).mockImplementation((_db, rootId) => {
      if (rootId === ROOT_ID) {
        return Promise.resolve([
          {
            relativePath: "Series A/#01.mp4",
            title: { work: "Series A", episode: "#01" },
          },
        ]);
      }

      return Promise.resolve([
        {
          relativePath: "Series B/#01.mp4",
          title: { work: "Series B", episode: "#01" },
        },
      ]);
    });

    const result = await syncAllSourceRootCatalogs(db);

    expect(result).toEqual({
      roots: [
        {
          rootId: ROOT_ID,
          sync: { status: "success", annict: ANNICT_SKIPPED },
        },
        {
          rootId: root2Id,
          sync: { status: "success", annict: ANNICT_SKIPPED },
        },
      ],
    });
    expect(listSourceFiles).toHaveBeenCalledWith(db, ROOT_ID);
    expect(listSourceFiles).toHaveBeenCalledWith(db, root2Id);
  });

  it("1 件の同期が失敗した場合は root ごとの失敗結果を返す", async () => {
    await seedSourceRoot(db);

    vi.mocked(listSourceFiles).mockRejectedValue(new Error("sync failed"));

    await expect(syncAllSourceRootCatalogs(db)).resolves.toEqual({
      roots: [
        {
          rootId: ROOT_ID,
          sync: { status: "failed", error: "カタログ同期に失敗しました" },
        },
      ],
    });
  });
});

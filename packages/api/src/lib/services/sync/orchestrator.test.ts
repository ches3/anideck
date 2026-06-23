import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Db } from "../../db/index.ts";
import { episodes, sourceRoots } from "../../db/schema.ts";
import { createTestDb, type TestDb } from "../../db/test-helper.ts";
import { enqueueStaleSeekThumbnailGenerations } from "../seek-thumbnail.ts";
import { listSourceFiles } from "../source-file.ts";
import { enqueueMissingAniListThumbnailFetches } from "./anilist-thumbnail.ts";
import { enqueuePendingAnnictEpisodeSearches } from "./annict.ts";
import { syncAllSources, syncSource, triggerSourceSync } from "./orchestrator.ts";

vi.mock("../source-file.ts", () => ({
  listSourceFiles: vi.fn(),
}));

vi.mock("./annict.ts", () => ({
  enqueuePendingAnnictEpisodeSearches: vi.fn(),
}));

vi.mock("./anilist-thumbnail.ts", () => ({
  enqueueMissingAniListThumbnailFetches: vi.fn(),
}));

vi.mock("../seek-thumbnail.ts", () => ({
  enqueueStaleSeekThumbnailGenerations: vi.fn(),
}));

const ROOT_ID = "ROOT1";
const EMPTY_ANNICT_EPISODE_SEARCH = {
  targeted: 0,
  queued: 0,
  alreadyQueued: 0,
  rerunRequested: 0,
};
const EMPTY_ANILIST_THUMBNAIL_FETCH = {
  targeted: 0,
  queued: 0,
  alreadyQueued: 0,
  rerunRequested: 0,
};
const EMPTY_SEEK_THUMBNAIL = { targeted: 0, queued: 0, skipped: 0 };
const EMPTY_JOBS = {
  annictEpisodeSearches: EMPTY_ANNICT_EPISODE_SEARCH,
  anilistThumbnailFetches: EMPTY_ANILIST_THUMBNAIL_FETCH,
  seekThumbnailGenerations: EMPTY_SEEK_THUMBNAIL,
};

async function seedSourceRoot(db: Db): Promise<void> {
  await db.insert(sourceRoots).values({
    id: ROOT_ID,
    path: "/media/anime",
  });
}

describe("syncSource", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(enqueuePendingAnnictEpisodeSearches).mockResolvedValue(EMPTY_ANNICT_EPISODE_SEARCH);
    vi.mocked(enqueueMissingAniListThumbnailFetches).mockResolvedValue(
      EMPTY_ANILIST_THUMBNAIL_FETCH,
    );
    vi.mocked(enqueueStaleSeekThumbnailGenerations).mockResolvedValue(EMPTY_SEEK_THUMBNAIL);
    testDb = await createTestDb();
    db = testDb.db;
    await seedSourceRoot(db);
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("listSourceFiles の結果を同期する", async () => {
    vi.mocked(listSourceFiles).mockResolvedValue([
      {
        relativePath: "Series A/#01.mp4",
        title: { work: "Series A", episode: "#01" },
      },
    ]);

    const result = await syncSource(db, ROOT_ID);

    expect(result).toEqual({
      files: { added: 1, updated: 0, deactivated: 0 },
      jobs: EMPTY_JOBS,
    });

    const rows = await db.select().from(episodes);
    expect(rows).toHaveLength(1);
    expect(listSourceFiles).toHaveBeenCalledWith(db, ROOT_ID);
  });
});

describe("syncAllSources", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(enqueuePendingAnnictEpisodeSearches).mockResolvedValue(EMPTY_ANNICT_EPISODE_SEARCH);
    vi.mocked(enqueueMissingAniListThumbnailFetches).mockResolvedValue(
      EMPTY_ANILIST_THUMBNAIL_FETCH,
    );
    vi.mocked(enqueueStaleSeekThumbnailGenerations).mockResolvedValue(EMPTY_SEEK_THUMBNAIL);
    testDb = await createTestDb();
    db = testDb.db;
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("source が 0 件の場合は空配列を返す", async () => {
    const result = await syncAllSources(db);

    expect(result).toEqual({ sources: [] });
    expect(listSourceFiles).not.toHaveBeenCalled();
  });

  it("複数 source の同期結果を返す", async () => {
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

    const result = await syncAllSources(db);

    expect(result).toEqual({
      sources: [
        {
          rootId: ROOT_ID,
          sync: {
            status: "success",
            files: { added: 1, updated: 0, deactivated: 0 },
            jobs: EMPTY_JOBS,
          },
        },
        {
          rootId: root2Id,
          sync: {
            status: "success",
            files: { added: 1, updated: 0, deactivated: 0 },
            jobs: EMPTY_JOBS,
          },
        },
      ],
    });
    expect(listSourceFiles).toHaveBeenCalledWith(db, ROOT_ID);
    expect(listSourceFiles).toHaveBeenCalledWith(db, root2Id);
  });

  it("同期が失敗した場合は source ごとの失敗結果を返す", async () => {
    await seedSourceRoot(db);

    vi.mocked(listSourceFiles).mockRejectedValue(new Error("sync failed"));

    await expect(syncAllSources(db)).resolves.toEqual({
      sources: [
        {
          rootId: ROOT_ID,
          sync: { status: "failed", error: "source 同期に失敗しました" },
        },
      ],
    });
  });
});

describe("triggerSourceSync", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let syncPromise: Promise<void> | undefined;
  let resolveAnnictSearch: (() => void) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(enqueuePendingAnnictEpisodeSearches).mockResolvedValue(EMPTY_ANNICT_EPISODE_SEARCH);
    vi.mocked(enqueueMissingAniListThumbnailFetches).mockResolvedValue(
      EMPTY_ANILIST_THUMBNAIL_FETCH,
    );
    vi.mocked(enqueueStaleSeekThumbnailGenerations).mockResolvedValue(EMPTY_SEEK_THUMBNAIL);
    testDb = await createTestDb();
    db = testDb.db;
    await seedSourceRoot(db);
    vi.mocked(listSourceFiles).mockResolvedValue([]);
    syncPromise = undefined;
    resolveAnnictSearch = undefined;
  });

  afterEach(async () => {
    resolveAnnictSearch?.();
    await syncPromise;
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("同一 source の実行中に再トリガーされた場合は完了後に再同期する", async () => {
    vi.mocked(enqueuePendingAnnictEpisodeSearches).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAnnictSearch = () => {
            resolve(EMPTY_ANNICT_EPISODE_SEARCH);
          };
        }),
    );

    syncPromise = triggerSourceSync(db, ROOT_ID);

    await vi.waitFor(() => {
      expect(enqueuePendingAnnictEpisodeSearches).toHaveBeenCalledTimes(1);
    });

    const duplicateSyncPromise = triggerSourceSync(db, ROOT_ID);
    expect(duplicateSyncPromise).toBe(syncPromise);
    expect(enqueuePendingAnnictEpisodeSearches).toHaveBeenCalledTimes(1);

    resolveAnnictSearch?.();
    await syncPromise;

    expect(enqueuePendingAnnictEpisodeSearches).toHaveBeenCalledTimes(2);
  });
});

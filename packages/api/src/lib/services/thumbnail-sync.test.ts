import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Db } from "../db/index.ts";
import { episodes, sourceRoots, type Work, works } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import { syncWorkThumbnails, THUMBNAIL_SYNC_DELAY_MS } from "./thumbnail-sync.ts";

vi.mock("../annict.ts", () => ({
  fetchWorkMalAnimeId: vi.fn(),
}));

vi.mock("../anilist.ts", () => ({
  fetchCoverImageByMalId: vi.fn(),
}));

import { fetchCoverImageByMalId } from "../anilist.ts";
import { fetchWorkMalAnimeId } from "../annict.ts";

const ROOT_ID = "ROOT1";
const TOKEN = "test-token";
const ANNICT_WORK_ID = "annict-work-1";
const ANNICT_WORK_ID_2 = "annict-work-2";
const MAL_ANIME_ID = 12345;
const THUMBNAIL_URL = "https://example.com/thumbnail.jpg";

async function seedWork(
  db: Db,
  input: {
    originalTitle: string;
    annictWorkId?: string | null;
    malAnimeId?: number | null;
    thumbnailUrl?: string | null;
    thumbnailStatus?: Work["thumbnailStatus"];
    active?: boolean;
  },
): Promise<string> {
  const workId = createWorkId(ROOT_ID, input.originalTitle);

  await db.insert(works).values({
    id: workId,
    rootId: ROOT_ID,
    originalTitle: input.originalTitle,
    annictWorkId: input.annictWorkId ?? null,
    malAnimeId: input.malAnimeId ?? null,
    thumbnailUrl: input.thumbnailUrl ?? null,
    thumbnailStatus: input.thumbnailStatus ?? null,
  });

  await db.insert(episodes).values({
    id: createEpisodeId(ROOT_ID, `${input.originalTitle}/#01.mp4`),
    workId,
    rootId: ROOT_ID,
    relativePath: `${input.originalTitle}/#01.mp4`,
    originalWorkTitle: input.originalTitle,
    originalTitle: "#01",
    active: input.active ?? true,
  });

  return workId;
}

describe("syncWorkThumbnails", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await db.insert(sourceRoots).values({ id: ROOT_ID, path: "/media/anime" });
    vi.mocked(fetchWorkMalAnimeId).mockReset();
    vi.mocked(fetchCoverImageByMalId).mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("token 未設定時は skipped を返して DB を更新しない", async () => {
    await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
    });

    const result = await syncWorkThumbnails(db, { rootId: ROOT_ID, token: "" });

    expect(result).toEqual({ status: "skipped", reason: "missing_token" });
    expect(fetchWorkMalAnimeId).not.toHaveBeenCalled();
  });

  it("Annict と AniList からサムネイル URL を取得して保存する", async () => {
    const workId = await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
    });

    vi.mocked(fetchWorkMalAnimeId).mockResolvedValue(String(MAL_ANIME_ID));
    vi.mocked(fetchCoverImageByMalId).mockResolvedValue(THUMBNAIL_URL);

    const result = await syncWorkThumbnails(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", found: 1, notFound: 0, error: 0 });
    expect(fetchWorkMalAnimeId).toHaveBeenCalledWith(ANNICT_WORK_ID, TOKEN);
    expect(fetchCoverImageByMalId).toHaveBeenCalledWith(MAL_ANIME_ID);

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work).toMatchObject({
      malAnimeId: MAL_ANIME_ID,
      thumbnailUrl: THUMBNAIL_URL,
      thumbnailStatus: "found",
    });
  });

  it("malAnimeId がない場合は not_found を保存する", async () => {
    const workId = await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
    });

    vi.mocked(fetchWorkMalAnimeId).mockResolvedValue(null);

    const result = await syncWorkThumbnails(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", found: 0, notFound: 1, error: 0 });
    expect(fetchCoverImageByMalId).not.toHaveBeenCalled();

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work).toMatchObject({
      malAnimeId: null,
      thumbnailUrl: null,
      thumbnailStatus: "not_found",
    });
  });

  it("AniList が null を返した場合は not_found を保存する", async () => {
    const workId = await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
    });

    vi.mocked(fetchWorkMalAnimeId).mockResolvedValue(String(MAL_ANIME_ID));
    vi.mocked(fetchCoverImageByMalId).mockResolvedValue(null);

    const result = await syncWorkThumbnails(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", found: 0, notFound: 1, error: 0 });

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work).toMatchObject({
      malAnimeId: MAL_ANIME_ID,
      thumbnailUrl: null,
      thumbnailStatus: "not_found",
    });
  });

  it("サムネイルが見つからない場合も work ごとに同期間隔を空ける", async () => {
    vi.useFakeTimers();
    await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
    });
    await seedWork(db, {
      originalTitle: "Series B",
      annictWorkId: ANNICT_WORK_ID_2,
    });

    let resolveFirstFetchCall = () => {};
    const firstFetchCall = new Promise<void>((resolve) => {
      resolveFirstFetchCall = resolve;
    });
    vi.mocked(fetchWorkMalAnimeId)
      .mockImplementationOnce(() => {
        resolveFirstFetchCall();
        return Promise.resolve(null);
      })
      .mockResolvedValueOnce(String(MAL_ANIME_ID));
    vi.mocked(fetchCoverImageByMalId).mockResolvedValueOnce(null);

    const resultPromise = syncWorkThumbnails(db, { rootId: ROOT_ID, token: TOKEN });
    await firstFetchCall;

    await vi.advanceTimersByTimeAsync(THUMBNAIL_SYNC_DELAY_MS - 1);
    expect(fetchWorkMalAnimeId).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => {
      expect(fetchWorkMalAnimeId).toHaveBeenCalledTimes(2);
    });
    await vi.advanceTimersByTimeAsync(THUMBNAIL_SYNC_DELAY_MS);

    await expect(resultPromise).resolves.toEqual({
      status: "success",
      found: 0,
      notFound: 2,
      error: 0,
    });
  });

  it("API エラー時は error を保存する", async () => {
    const workId = await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
      malAnimeId: MAL_ANIME_ID,
      thumbnailUrl: "https://example.com/old.jpg",
    });

    vi.mocked(fetchWorkMalAnimeId).mockRejectedValue(new Error("network error"));

    const result = await syncWorkThumbnails(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", found: 0, notFound: 0, error: 1 });

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work).toMatchObject({
      malAnimeId: MAL_ANIME_ID,
      thumbnailUrl: "https://example.com/old.jpg",
      thumbnailStatus: "error",
    });
  });

  it("thumbnailStatus が found の work は同期対象に含めない", async () => {
    await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
      thumbnailStatus: "found",
      thumbnailUrl: THUMBNAIL_URL,
    });

    const result = await syncWorkThumbnails(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", found: 0, notFound: 0, error: 0 });
    expect(fetchWorkMalAnimeId).not.toHaveBeenCalled();
  });

  it("thumbnailStatus が error の work は再同期対象に含める", async () => {
    const workId = await seedWork(db, {
      originalTitle: "Series A",
      annictWorkId: ANNICT_WORK_ID,
      thumbnailStatus: "error",
    });

    vi.mocked(fetchWorkMalAnimeId).mockResolvedValue(String(MAL_ANIME_ID));
    vi.mocked(fetchCoverImageByMalId).mockResolvedValue(THUMBNAIL_URL);

    const result = await syncWorkThumbnails(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", found: 1, notFound: 0, error: 0 });

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work?.thumbnailStatus).toBe("found");
  });
});

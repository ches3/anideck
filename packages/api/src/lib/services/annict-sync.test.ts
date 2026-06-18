import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Db } from "../db/index.ts";
import { type Episode, episodes, sourceRoots, works } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import { syncAnnictTitles } from "./annict-sync.ts";

vi.mock("@anirec/annict", () => ({
  search: vi.fn(),
}));

import { search } from "@anirec/annict";

const ROOT_ID = "ROOT1";
const TOKEN = "test-token";

async function seedEpisode(
  db: Db,
  input: {
    relativePath: string;
    originalWorkTitle: string;
    originalTitle: string;
    annictStatus?: Episode["annictStatus"];
    annictTitle?: string | null;
    annictEpisodeId?: string | null;
    annictEpisodeNumber?: number | null;
    annictEpisodeNumberText?: string | null;
    annictNoEpisodes?: boolean | null;
    active?: boolean;
  },
): Promise<{ workId: string; episodeId: string }> {
  const workId = createWorkId(ROOT_ID, input.originalWorkTitle);
  const episodeId = createEpisodeId(ROOT_ID, input.relativePath);

  const existingWork = await db.query.works.findFirst({
    where: eq(works.id, workId),
  });
  if (existingWork === undefined) {
    await db.insert(works).values({
      id: workId,
      rootId: ROOT_ID,
      originalTitle: input.originalWorkTitle,
    });
  }

  await db.insert(episodes).values({
    id: episodeId,
    workId,
    rootId: ROOT_ID,
    relativePath: input.relativePath,
    originalWorkTitle: input.originalWorkTitle,
    originalTitle: input.originalTitle,
    active: input.active ?? true,
    annictStatus: input.annictStatus ?? null,
    annictTitle: input.annictTitle ?? null,
    annictEpisodeId: input.annictEpisodeId ?? null,
    annictEpisodeNumber: input.annictEpisodeNumber ?? null,
    annictEpisodeNumberText: input.annictEpisodeNumberText ?? null,
    annictNoEpisodes: input.annictNoEpisodes ?? null,
  });

  return { workId, episodeId };
}

describe("syncAnnictTitles", () => {
  let db: Db;
  let testDb: TestDb | undefined;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await db.insert(sourceRoots).values({ id: ROOT_ID, path: "/media/anime" });
    vi.mocked(search).mockReset();
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("token 未設定時は skipped を返して DB を更新しない", async () => {
    await seedEpisode(db, {
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
    });

    const result = await syncAnnictTitles(db, { rootId: ROOT_ID, token: "" });

    expect(result).toEqual({ status: "skipped", reason: "missing_token" });
    expect(search).not.toHaveBeenCalled();
  });

  it("エピソードが存在する場合は works と episodes を更新する", async () => {
    const { workId, episodeId } = await seedEpisode(db, {
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
    });

    vi.mocked(search).mockResolvedValue({
      id: "work-1",
      title: "Annict Work",
      episode: {
        id: "episode-1",
        title: "Annict Episode",
        number: 1,
        numberText: "#01",
      },
    });

    const result = await syncAnnictTitles(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", matched: 1, notFound: 0, error: 0 });
    expect(search).toHaveBeenCalledWith({ workTitle: "Series A", episodeTitle: "#01" }, TOKEN);

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work).toMatchObject({
      annictWorkId: "work-1",
      annictTitle: "Annict Work",
    });

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode).toMatchObject({
      annictEpisodeId: "episode-1",
      annictTitle: "Annict Episode",
      annictEpisodeNumber: 1,
      annictEpisodeNumberText: "#01",
      annictNoEpisodes: false,
      annictStatus: "matched",
    });
  });

  it("エピソードがない作品の場合は workTitle を episodeTitle として保存する", async () => {
    const { workId, episodeId } = await seedEpisode(db, {
      relativePath: "Movie/movie.mp4",
      originalWorkTitle: "Movie",
      originalTitle: "Movie",
    });

    vi.mocked(search).mockResolvedValue({
      id: "work-2",
      title: "Annict Movie",
      episode: undefined,
    });

    const result = await syncAnnictTitles(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", matched: 1, notFound: 0, error: 0 });

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work).toMatchObject({
      annictWorkId: "work-2",
      annictTitle: "Annict Movie",
    });

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode).toMatchObject({
      annictEpisodeId: null,
      annictTitle: "Annict Movie",
      annictEpisodeNumber: null,
      annictEpisodeNumberText: null,
      annictNoEpisodes: true,
      annictStatus: "matched",
    });
  });

  it("not_found の場合は status のみ更新して works は更新しない", async () => {
    const { workId, episodeId } = await seedEpisode(db, {
      relativePath: "Unknown/#01.mp4",
      originalWorkTitle: "Unknown",
      originalTitle: "#01",
    });

    vi.mocked(search).mockResolvedValue(undefined);

    const result = await syncAnnictTitles(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", matched: 0, notFound: 1, error: 0 });

    const work = await db.query.works.findFirst({ where: eq(works.id, workId) });
    expect(work).toMatchObject({
      annictWorkId: null,
      annictTitle: null,
    });

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode).toMatchObject({
      annictEpisodeId: null,
      annictTitle: null,
      annictEpisodeNumber: null,
      annictEpisodeNumberText: null,
      annictNoEpisodes: null,
      annictStatus: "not_found",
    });
  });

  it("error の場合は status のみ error にして既存の Annict データは維持する", async () => {
    const { episodeId } = await seedEpisode(db, {
      relativePath: "Series A/#01.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      annictTitle: "Existing Title",
      annictEpisodeId: "existing-episode",
      annictEpisodeNumber: 1,
      annictEpisodeNumberText: "#01",
      annictNoEpisodes: false,
    });

    vi.mocked(search).mockRejectedValue(new Error("network error"));

    const result = await syncAnnictTitles(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", matched: 0, notFound: 0, error: 1 });

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode).toMatchObject({
      annictEpisodeId: "existing-episode",
      annictTitle: "Existing Title",
      annictEpisodeNumber: 1,
      annictEpisodeNumberText: "#01",
      annictNoEpisodes: false,
      annictStatus: "error",
    });
  });

  it("matched or not_found の episode はスキップして error のみを再検索する", async () => {
    await seedEpisode(db, {
      relativePath: "Matched/#01.mp4",
      originalWorkTitle: "Matched",
      originalTitle: "#01",
      annictStatus: "matched",
    });
    await seedEpisode(db, {
      relativePath: "NotFound/#01.mp4",
      originalWorkTitle: "NotFound",
      originalTitle: "#01",
      annictStatus: "not_found",
    });
    const { episodeId: errorEpisodeId } = await seedEpisode(db, {
      relativePath: "Error/#01.mp4",
      originalWorkTitle: "Error",
      originalTitle: "#01",
      annictStatus: "error",
    });

    vi.mocked(search).mockResolvedValue({
      id: "work-3",
      title: "Retry Work",
      episode: {
        id: "episode-3",
        title: "Retry Episode",
        number: 1,
        numberText: "#01",
      },
    });

    const result = await syncAnnictTitles(db, { rootId: ROOT_ID, token: TOKEN });

    expect(result).toEqual({ status: "success", matched: 1, notFound: 0, error: 0 });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith({ workTitle: "Error", episodeTitle: "#01" }, TOKEN);

    const episode = await db.query.episodes.findFirst({
      where: eq(episodes.id, errorEpisodeId),
    });
    expect(episode?.annictStatus).toBe("matched");
  });
});

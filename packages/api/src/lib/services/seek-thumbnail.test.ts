import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import * as v from "valibot";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { episodes, sourceRoots, works } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import {
  buildSeekThumbnailManifest,
  seekThumbnailManifestSchema,
  type SeekThumbnailManifest,
} from "../seek-thumbnail/manifest.ts";
import {
  resolveSeekThumbnailSpritePath,
  resolveSeekThumbnailSpriteTmpPath,
} from "../seek-thumbnail/paths.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import {
  enqueueSeekThumbnailGeneration,
  enqueueStaleSeekThumbnailGenerations,
  getSeekThumbnailManifest,
  getSeekThumbnailSprite,
} from "./seek-thumbnail.ts";

vi.mock("../seek-thumbnail/ffprobe.ts", () => ({
  probeVideo: vi.fn(),
}));

vi.mock("../seek-thumbnail/ffmpeg.ts", () => ({
  generateSeekThumbnailSprite: vi.fn(),
}));

const { mockIsQueuedOrRunning, mockEnqueue, queueRunRef } = vi.hoisted(() => ({
  mockIsQueuedOrRunning: vi.fn(),
  mockEnqueue: vi.fn(),
  queueRunRef: {
    current: undefined as
      | ((job: { db: Db; workId: string; episodeId: string }) => Promise<void>)
      | undefined,
  },
}));

vi.mock("./job-queue.ts", () => ({
  KeyedSerialQueue: vi.fn(function KeyedSerialQueue(options: {
    run: (job: { db: Db; workId: string; episodeId: string }) => Promise<void>;
  }) {
    queueRunRef.current = options.run;
    return {
      isQueuedOrRunning: mockIsQueuedOrRunning,
      enqueue: mockEnqueue,
    };
  }),
}));

import { generateSeekThumbnailSprite } from "../seek-thumbnail/ffmpeg.ts";
import { probeVideo } from "../seek-thumbnail/ffprobe.ts";

const ROOT_ID = "ROOT1";

let tempDir = "";

async function seedEpisode(
  db: Db,
  input?: {
    sourceSize?: number | null;
    sourceMtimeMs?: number | null;
  },
) {
  const workId = createWorkId(ROOT_ID, "Series A");
  const episodeId = createEpisodeId(ROOT_ID, "video.mp4");

  await db.insert(sourceRoots).values({ id: ROOT_ID, path: tempDir });
  await db.insert(works).values({
    id: workId,
    rootId: ROOT_ID,
    originalTitle: "Series A",
  });
  await db.insert(episodes).values({
    id: episodeId,
    workId,
    rootId: ROOT_ID,
    relativePath: "video.mp4",
    originalWorkTitle: "Series A",
    originalTitle: "#01",
    active: true,
    sourceSize: input?.sourceSize ?? null,
    sourceMtimeMs: input?.sourceMtimeMs ?? null,
  });

  return { workId, episodeId };
}

async function seedEpisodeWithPath(
  db: Db,
  relativePath: string,
  input?: {
    sourceSize?: number | null;
    sourceMtimeMs?: number | null;
    workTitle?: string;
    episodeTitle?: string;
    skipRootInsert?: boolean;
    skipWorkInsert?: boolean;
  },
) {
  const workTitle = input?.workTitle ?? "Series A";
  const workId = createWorkId(ROOT_ID, workTitle);
  const episodeId = createEpisodeId(ROOT_ID, relativePath);

  if (input?.skipRootInsert !== true) {
    await db.insert(sourceRoots).values({ id: ROOT_ID, path: tempDir });
  }
  if (input?.skipWorkInsert !== true) {
    await db.insert(works).values({
      id: workId,
      rootId: ROOT_ID,
      originalTitle: workTitle,
    });
  }
  await db.insert(episodes).values({
    id: episodeId,
    workId,
    rootId: ROOT_ID,
    relativePath,
    originalWorkTitle: workTitle,
    originalTitle: input?.episodeTitle ?? "#01",
    active: true,
    sourceSize: input?.sourceSize ?? null,
    sourceMtimeMs: input?.sourceMtimeMs ?? null,
  });

  return { workId, episodeId };
}

function defaultSeekThumbnailManifest(): SeekThumbnailManifest {
  return buildSeekThumbnailManifest({
    durationSec: 1440,
    videoWidth: 1920,
    videoHeight: 1080,
  });
}

async function saveSeekThumbnailManifest(
  db: Db,
  episodeId: string,
  manifest: SeekThumbnailManifest,
): Promise<void> {
  await db
    .update(episodes)
    .set({ seekThumbnailManifest: manifest })
    .where(eq(episodes.id, episodeId));
}

async function seedSeekThumbnailSprite(episodeId: string, content = "webp"): Promise<void> {
  await mkdir(join(resolveSeekThumbnailSpritePath(episodeId), ".."), { recursive: true });
  await writeFile(resolveSeekThumbnailSpritePath(episodeId), content);
}

async function seedSeekThumbnailCache(
  db: Db,
  episodeId: string,
  input?: { manifest?: SeekThumbnailManifest; sprite?: boolean },
): Promise<SeekThumbnailManifest> {
  const manifest = input?.manifest ?? defaultSeekThumbnailManifest();
  await saveSeekThumbnailManifest(db, episodeId, manifest);
  if (input?.sprite !== false) {
    await seedSeekThumbnailSprite(episodeId);
  }
  return manifest;
}

async function seedReadySeekThumbnailCache(
  db: Db,
  episodeId: string,
  videoPath: string,
  input?: { manifest?: SeekThumbnailManifest; sprite?: boolean },
): Promise<SeekThumbnailManifest> {
  const manifest = await seedSeekThumbnailCache(db, episodeId, input);
  const videoStat = await stat(videoPath);
  await db
    .update(episodes)
    .set({
      sourceSize: videoStat.size,
      sourceMtimeMs: Math.trunc(videoStat.mtimeMs),
    })
    .where(eq(episodes.id, episodeId));
  return manifest;
}

describe("seek thumbnail generation via enqueue", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let dataDir: string;
  let videoPath: string;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    tempDir = await mkdtemp(join(tmpdir(), "anideck-seek-thumbnail-test-"));
    dataDir = join(tempDir, "data");
    await mkdir(dataDir, { recursive: true });
    vi.stubEnv("ANIDECK_DATA_DIR", dataDir);
    mockIsQueuedOrRunning.mockReturnValue(false);

    videoPath = join(tempDir, "video.mp4");
    await writeFile(videoPath, "test");

    vi.mocked(probeVideo).mockResolvedValue({
      durationSec: 1440,
      width: 1920,
      height: 1080,
    });
    vi.mocked(generateSeekThumbnailSprite).mockImplementation(async (_input, outputPath) => {
      await writeFile(outputPath, "webp");
    });
    mockEnqueue.mockImplementation(async (job: { db: Db; workId: string; episodeId: string }) => {
      try {
        await queueRunRef.current?.(job);
      } catch {
        // KeyedSerialQueue は run 失敗を握りつぶす
      }
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.mocked(probeVideo).mockReset();
    vi.mocked(generateSeekThumbnailSprite).mockReset();
    mockIsQueuedOrRunning.mockReset();
    mockEnqueue.mockReset();
    await testDb?.cleanup();
    testDb = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("キャッシュが有効な場合は生成をスキップする", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath);

    const result = await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(result).toBe("skipped");
    expect(probeVideo).not.toHaveBeenCalled();
    expect(generateSeekThumbnailSprite).not.toHaveBeenCalled();
  });

  it("生成成功時に DB とキャッシュファイルを更新する", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    const videoStat = await stat(videoPath);

    const result = await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(result).toBe("queued");

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode?.sourceSize).toBe(videoStat.size);
    expect(episode?.sourceMtimeMs).toBe(Math.trunc(videoStat.mtimeMs));

    const manifest = v.parse(seekThumbnailManifestSchema, episode?.seekThumbnailManifest);
    expect(manifest.count).toBe(144);
    expect(await readText(resolveSeekThumbnailSpritePath(episodeId))).toBe("webp");
    await expect(accessTmpFiles(episodeId)).rejects.toThrow();
  });

  it("生成失敗時は manifest をクリアして tmp ファイルのみ削除する", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    const manifest = defaultSeekThumbnailManifest();
    await saveSeekThumbnailManifest(db, episodeId, manifest);
    await seedSeekThumbnailSprite(episodeId, "existing-webp");

    vi.mocked(probeVideo).mockRejectedValue(new Error("ffprobe failed"));

    const result = await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(result).toBe("queued");

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode?.seekThumbnailManifest).toBeNull();
    expect(episode?.sourceSize).toBeNull();
    expect(episode?.sourceMtimeMs).toBeNull();
    expect(await readText(resolveSeekThumbnailSpritePath(episodeId))).toBe("existing-webp");
    await expect(accessTmpFiles(episodeId)).rejects.toThrow();
  });

  it("元動画の size/mtime が変わった場合は再生成する", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath, { sprite: true });
    await seedSeekThumbnailSprite(episodeId, "old-webp");

    await db
      .update(episodes)
      .set({
        sourceSize: 999,
        sourceMtimeMs: 1,
      })
      .where(eq(episodes.id, episodeId));

    const result = await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(result).toBe("queued");
    expect(await readText(resolveSeekThumbnailSpritePath(episodeId))).toBe("webp");
  });
});

describe("enqueueSeekThumbnailGeneration", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let dataDir: string;
  let videoPath: string;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    tempDir = await mkdtemp(join(tmpdir(), "anideck-seek-thumbnail-enqueue-test-"));
    dataDir = join(tempDir, "data");
    await mkdir(dataDir, { recursive: true });
    vi.stubEnv("ANIDECK_DATA_DIR", dataDir);
    mockIsQueuedOrRunning.mockReturnValue(false);
    mockEnqueue.mockReset();
    mockEnqueue.mockResolvedValue(undefined);

    videoPath = join(tempDir, "video.mp4");
    await writeFile(videoPath, "test");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    mockIsQueuedOrRunning.mockReset();
    mockEnqueue.mockReset();
    await testDb?.cleanup();
    testDb = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("キャッシュが有効な場合はキューに追加しない", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath);

    await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("キュー実行中の場合はキューに追加しない", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    mockIsQueuedOrRunning.mockReturnValue(true);

    await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("生成が必要な場合はキューに追加する", async () => {
    const { workId, episodeId } = await seedEpisode(db);

    await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(mockEnqueue).toHaveBeenCalledWith({ db, workId, episodeId });
  });

  it("manifest が欠損している場合はキューに追加する", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedSeekThumbnailSprite(episodeId);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath, { sprite: false });

    await db
      .update(episodes)
      .set({ seekThumbnailManifest: null })
      .where(eq(episodes.id, episodeId));

    await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(mockEnqueue).toHaveBeenCalledWith({ db, workId, episodeId });
  });

  it("画像ファイルが欠損している場合はキューに追加する", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath, { sprite: false });

    await enqueueSeekThumbnailGeneration(db, { workId, episodeId });

    expect(mockEnqueue).toHaveBeenCalledWith({ db, workId, episodeId });
  });
});

describe("enqueueStaleSeekThumbnailGenerations", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let dataDir: string;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    tempDir = await mkdtemp(join(tmpdir(), "anideck-seek-thumbnail-stale-enqueue-test-"));
    dataDir = join(tempDir, "data");
    await mkdir(dataDir, { recursive: true });
    vi.stubEnv("ANIDECK_DATA_DIR", dataDir);
    mockIsQueuedOrRunning.mockReturnValue(false);
    mockEnqueue.mockReset();
    mockEnqueue.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    mockIsQueuedOrRunning.mockReset();
    mockEnqueue.mockReset();
    await testDb?.cleanup();
    testDb = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("全エピソードがサムネイル生成済みの場合はキューに追加しない", async () => {
    const videoPath1 = join(tempDir, "video1.mp4");
    const videoPath2 = join(tempDir, "video2.mp4");
    await writeFile(videoPath1, "test1");
    await writeFile(videoPath2, "test2");

    const first = await seedEpisodeWithPath(db, "video1.mp4");
    await seedEpisodeWithPath(db, "video2.mp4", {
      skipRootInsert: true,
      skipWorkInsert: true,
      episodeTitle: "#02",
    });
    await seedReadySeekThumbnailCache(db, first.episodeId, videoPath1);
    await seedReadySeekThumbnailCache(db, createEpisodeId(ROOT_ID, "video2.mp4"), videoPath2);

    const result = await enqueueStaleSeekThumbnailGenerations(db, ROOT_ID);

    expect(result).toEqual({ targeted: 2, queued: 0, skipped: 2 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("全エピソードが未生成の場合はすべてキューに追加する", async () => {
    await seedEpisodeWithPath(db, "video1.mp4");
    await seedEpisodeWithPath(db, "video2.mp4", {
      skipRootInsert: true,
      skipWorkInsert: true,
      episodeTitle: "#02",
    });

    const result = await enqueueStaleSeekThumbnailGenerations(db, ROOT_ID);

    expect(result).toEqual({ targeted: 2, queued: 2, skipped: 0 });
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
  });

  it("サムネイル生成済みと未生成が混在する場合は件数を正しく集計する", async () => {
    const readyVideoPath = join(tempDir, "ready.mp4");
    await writeFile(readyVideoPath, "ready");

    const ready = await seedEpisodeWithPath(db, "ready.mp4");
    await seedEpisodeWithPath(db, "pending.mp4", {
      skipRootInsert: true,
      skipWorkInsert: true,
      episodeTitle: "#02",
    });
    await seedReadySeekThumbnailCache(db, ready.episodeId, readyVideoPath);

    const result = await enqueueStaleSeekThumbnailGenerations(db, ROOT_ID);

    expect(result).toEqual({ targeted: 2, queued: 1, skipped: 1 });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      db,
      workId: createWorkId(ROOT_ID, "Series A"),
      episodeId: createEpisodeId(ROOT_ID, "pending.mp4"),
    });
  });

  it("キュー実行中のエピソードは skipped に計上する", async () => {
    const running = await seedEpisodeWithPath(db, "running.mp4");
    await seedEpisodeWithPath(db, "pending.mp4", {
      skipRootInsert: true,
      skipWorkInsert: true,
      episodeTitle: "#02",
    });

    mockIsQueuedOrRunning.mockImplementation((episodeId: string) => {
      return episodeId === running.episodeId;
    });

    const result = await enqueueStaleSeekThumbnailGenerations(db, ROOT_ID);

    expect(result).toEqual({ targeted: 2, queued: 1, skipped: 1 });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it("画像ファイルが欠損しているエピソードは stale としてキューに追加する", async () => {
    const videoPath = join(tempDir, "video.mp4");
    await writeFile(videoPath, "test");

    const { episodeId } = await seedEpisodeWithPath(db, "video.mp4");
    await seedReadySeekThumbnailCache(db, episodeId, videoPath, { sprite: false });

    const result = await enqueueStaleSeekThumbnailGenerations(db, ROOT_ID);

    expect(result).toEqual({ targeted: 1, queued: 1, skipped: 0 });
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });
});

describe("getSeekThumbnailManifest", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let dataDir: string;
  let videoPath: string;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    tempDir = await mkdtemp(join(tmpdir(), "anideck-seek-thumbnail-manifest-test-"));
    dataDir = join(tempDir, "data");
    await mkdir(dataDir, { recursive: true });
    vi.stubEnv("ANIDECK_DATA_DIR", dataDir);

    videoPath = join(tempDir, "video.mp4");
    await writeFile(videoPath, "test");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await testDb?.cleanup();
    testDb = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("manifest が存在する場合は manifest を返す", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    const manifest = await seedReadySeekThumbnailCache(db, episodeId, videoPath);

    const result = await getSeekThumbnailManifest(db, workId, episodeId);

    expect(result).toEqual(manifest);
  });

  it("manifest が欠損している場合は NotFoundError を投げる", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedSeekThumbnailSprite(episodeId);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath, { sprite: false });

    await db
      .update(episodes)
      .set({ seekThumbnailManifest: null })
      .where(eq(episodes.id, episodeId));

    await expect(getSeekThumbnailManifest(db, workId, episodeId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("画像ファイルが欠損している場合は NotFoundError を投げて manifest をクリアする", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath, { sprite: false });
    const videoStat = await stat(videoPath);

    await expect(getSeekThumbnailManifest(db, workId, episodeId)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode?.seekThumbnailManifest).toBeNull();
    expect(episode?.sourceSize).toBe(videoStat.size);
    expect(episode?.sourceMtimeMs).toBe(Math.trunc(videoStat.mtimeMs));
  });

  it("元動画の size/mtime が変わった場合は NotFoundError を投げて manifest をクリアする", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath);

    await db
      .update(episodes)
      .set({
        sourceSize: 999,
        sourceMtimeMs: 1,
      })
      .where(eq(episodes.id, episodeId));

    await expect(getSeekThumbnailManifest(db, workId, episodeId)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode?.seekThumbnailManifest).toBeNull();
    expect(episode?.sourceSize).toBe(999);
    expect(episode?.sourceMtimeMs).toBe(1);
  });
});

describe("getSeekThumbnailSprite", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let dataDir: string;
  let videoPath: string;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    tempDir = await mkdtemp(join(tmpdir(), "anideck-seek-thumbnail-sprite-test-"));
    dataDir = join(tempDir, "data");
    await mkdir(dataDir, { recursive: true });
    vi.stubEnv("ANIDECK_DATA_DIR", dataDir);

    videoPath = join(tempDir, "video.mp4");
    await writeFile(videoPath, "test");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await testDb?.cleanup();
    testDb = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("画像ファイルが存在する場合は画像を返す", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath);

    const result = await getSeekThumbnailSprite(db, workId, episodeId);

    expect(Buffer.from(result).toString()).toBe("webp");
  });

  it("画像ファイルが欠損している場合は NotFoundError を投げて manifest をクリアする", async () => {
    const { workId, episodeId } = await seedEpisode(db);
    await seedReadySeekThumbnailCache(db, episodeId, videoPath, { sprite: false });
    const videoStat = await stat(videoPath);

    await expect(getSeekThumbnailSprite(db, workId, episodeId)).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const episode = await db.query.episodes.findFirst({ where: eq(episodes.id, episodeId) });
    expect(episode?.seekThumbnailManifest).toBeNull();
    expect(episode?.sourceSize).toBe(videoStat.size);
    expect(episode?.sourceMtimeMs).toBe(Math.trunc(videoStat.mtimeMs));
  });
});

async function readText(filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(filePath, "utf8");
}

async function accessTmpFiles(episodeId: string): Promise<void> {
  const { access } = await import("node:fs/promises");
  await access(resolveSeekThumbnailSpriteTmpPath(episodeId));
}

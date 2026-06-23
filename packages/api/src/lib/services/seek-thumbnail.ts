import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import {
  createEpisodeNotFoundError,
  createSeekThumbnailNotFoundError,
} from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { episodes, sourceRoots } from "../db/schema.ts";
import { fileExists } from "../fs.ts";
import {
  cleanupSeekThumbnailTmpFiles,
  generateSeekThumbnailFiles,
} from "../seek-thumbnail/generation.ts";
import {
  seekThumbnailManifestSchema,
  type SeekThumbnailManifest,
} from "../seek-thumbnail/manifest.ts";
import {
  resolveSeekThumbnailSpritePath,
  SEEK_THUMBNAIL_SPRITE_FILE,
} from "../seek-thumbnail/paths.ts";
import { KeyedSerialQueue } from "./job-queue.ts";
import { getWorkEpisode } from "./work.ts";

const seekThumbnailRecordSelect = {
  seekThumbnailManifest: episodes.seekThumbnailManifest,
  sourceSize: episodes.sourceSize,
  sourceMtimeMs: episodes.sourceMtimeMs,
  rootPath: sourceRoots.path,
  relativePath: episodes.relativePath,
} as const;

interface SeekThumbnailRecordRow {
  seekThumbnailManifest: SeekThumbnailManifest | null;
  sourceSize: number | null;
  sourceMtimeMs: number | null;
  rootPath: string;
  relativePath: string;
}

function toSeekThumbnailRecord(row: SeekThumbnailRecordRow): SeekThumbnailRecord {
  return {
    seekThumbnailManifest: row.seekThumbnailManifest,
    sourceSize: row.sourceSize,
    sourceMtimeMs: row.sourceMtimeMs,
    sourcePath: join(row.rootPath, row.relativePath),
  };
}

interface SeekThumbnailRecordEntry {
  workId: string;
  episodeId: string;
  record: SeekThumbnailRecord;
}

async function getSeekThumbnailRecord(
  db: Db,
  workId: string,
  episodeId: string,
): Promise<SeekThumbnailRecord | undefined> {
  const row = await db
    .select(seekThumbnailRecordSelect)
    .from(episodes)
    .innerJoin(sourceRoots, eq(episodes.rootId, sourceRoots.id))
    .where(and(eq(episodes.id, episodeId), eq(episodes.workId, workId), eq(episodes.active, true)))
    .get();

  if (row === undefined) {
    return undefined;
  }

  return toSeekThumbnailRecord(row);
}

async function listSeekThumbnailRecords(
  db: Db,
  rootId: string,
): Promise<SeekThumbnailRecordEntry[]> {
  const rows = await db
    .select({
      episodeId: episodes.id,
      workId: episodes.workId,
      ...seekThumbnailRecordSelect,
    })
    .from(episodes)
    .innerJoin(sourceRoots, eq(episodes.rootId, sourceRoots.id))
    .where(and(eq(episodes.rootId, rootId), eq(episodes.active, true)));

  return rows.map((row) => ({
    workId: row.workId,
    episodeId: row.episodeId,
    record: toSeekThumbnailRecord(row),
  }));
}

type RunSeekThumbnailGenerationResult =
  | { status: "ready" }
  | { status: "failed" }
  | { status: "skipped" };

export interface SeekThumbnailGenerationEnqueueResult {
  targeted: number;
  queued: number;
  skipped: number;
}

interface SeekThumbnailGenerationJob {
  db: Db;
  workId: string;
  episodeId: string;
}

interface SeekThumbnailRecord {
  seekThumbnailManifest: SeekThumbnailManifest | null;
  sourceSize: number | null;
  sourceMtimeMs: number | null;
  sourcePath: string;
}

interface SourceStat {
  size: number;
  mtimeMs: number;
}

async function getEpisodeSourceStat(sourcePath: string): Promise<SourceStat | undefined> {
  try {
    const sourceStat = await stat(sourcePath);
    return {
      size: sourceStat.size,
      mtimeMs: Math.trunc(sourceStat.mtimeMs),
    };
  } catch {
    return undefined;
  }
}

async function clearSeekThumbnailManifest(db: Db, episodeId: string): Promise<void> {
  await db.update(episodes).set({ seekThumbnailManifest: null }).where(eq(episodes.id, episodeId));
}

async function isSeekThumbnailStale(
  record: SeekThumbnailRecord,
  episodeId: string,
): Promise<boolean> {
  if (
    record.seekThumbnailManifest === null ||
    record.sourceSize === null ||
    record.sourceMtimeMs === null
  ) {
    return true;
  }

  const currentStat = await getEpisodeSourceStat(record.sourcePath);
  if (currentStat === undefined) {
    return true;
  }

  if (record.sourceSize !== currentStat.size || record.sourceMtimeMs !== currentStat.mtimeMs) {
    return true;
  }

  return !(await fileExists(resolveSeekThumbnailSpritePath(episodeId)));
}

async function runSeekThumbnailGeneration(
  db: Db,
  input: { workId: string; episodeId: string },
): Promise<RunSeekThumbnailGenerationResult> {
  const { workId, episodeId } = input;

  const episode = await db.query.episodes.findFirst({
    where: and(eq(episodes.id, episodeId), eq(episodes.workId, workId)),
  });

  if (episode === undefined || !episode.active) {
    await clearSeekThumbnailManifest(db, episodeId);
    return { status: "skipped" };
  }

  try {
    const detail = await getWorkEpisode(db, workId, episodeId);
    const currentStat = await getEpisodeSourceStat(detail.episode.path);
    if (currentStat === undefined) {
      throw new Error("episode source file is not available");
    }

    const manifest = await generateSeekThumbnailFiles({
      episodeId,
      sourcePath: detail.episode.path,
    });

    await db
      .update(episodes)
      .set({
        seekThumbnailManifest: manifest,
        sourceSize: currentStat.size,
        sourceMtimeMs: currentStat.mtimeMs,
      })
      .where(eq(episodes.id, episodeId));

    return { status: "ready" };
  } catch {
    await cleanupSeekThumbnailTmpFiles(episodeId);
    await clearSeekThumbnailManifest(db, episodeId);
    return { status: "failed" };
  }
}

const seekThumbnailGenerationQueue = new KeyedSerialQueue<SeekThumbnailGenerationJob>({
  getKey: (job) => job.episodeId,
  logLabel: "seek thumbnail generation",
  runningDuplicateBehavior: "dedupe",
  run: async (job) => {
    const { db, workId, episodeId } = job;
    const result = await runSeekThumbnailGeneration(db, { workId, episodeId });
    if (result.status === "failed") {
      throw new Error("seek thumbnail generation failed");
    }
  },
});

export type EnqueueSeekThumbnailGenerationResult = "queued" | "skipped";

async function enqueueSeekThumbnailGenerationFromRecord(
  db: Db,
  input: { workId: string; episodeId: string },
  record: SeekThumbnailRecord,
): Promise<EnqueueSeekThumbnailGenerationResult> {
  const { workId, episodeId } = input;

  if (await isSeekThumbnailStale(record, episodeId)) {
    if (record.seekThumbnailManifest !== null) {
      await clearSeekThumbnailManifest(db, episodeId);
    }
  } else {
    return "skipped";
  }

  if (seekThumbnailGenerationQueue.isQueuedOrRunning(episodeId)) {
    return "skipped";
  }

  await seekThumbnailGenerationQueue.enqueue({ db, workId, episodeId });
  return "queued";
}

export async function enqueueSeekThumbnailGeneration(
  db: Db,
  input: { workId: string; episodeId: string },
): Promise<EnqueueSeekThumbnailGenerationResult> {
  const { workId, episodeId } = input;

  const record = await getSeekThumbnailRecord(db, workId, episodeId);
  if (record === undefined) {
    throw createEpisodeNotFoundError(workId, episodeId);
  }

  return enqueueSeekThumbnailGenerationFromRecord(db, { workId, episodeId }, record);
}

export async function enqueueStaleSeekThumbnailGenerations(
  db: Db,
  rootId: string,
): Promise<SeekThumbnailGenerationEnqueueResult> {
  const entries = await listSeekThumbnailRecords(db, rootId);

  const result: SeekThumbnailGenerationEnqueueResult = {
    targeted: entries.length,
    queued: 0,
    skipped: 0,
  };

  for (const { workId, episodeId, record } of entries) {
    const enqueueResult = await enqueueSeekThumbnailGenerationFromRecord(
      db,
      { workId, episodeId },
      record,
    );

    if (enqueueResult === "queued") {
      result.queued += 1;
    } else {
      result.skipped += 1;
    }
  }

  return result;
}

export async function getSeekThumbnailManifest(
  db: Db,
  workId: string,
  episodeId: string,
): Promise<SeekThumbnailManifest> {
  const record = await getSeekThumbnailRecord(db, workId, episodeId);
  if (record === undefined) {
    throw createSeekThumbnailNotFoundError(workId, episodeId, "seek-thumbnail");
  }

  if (await isSeekThumbnailStale(record, episodeId)) {
    if (record.seekThumbnailManifest !== null) {
      await clearSeekThumbnailManifest(db, episodeId);
    }

    throw createSeekThumbnailNotFoundError(workId, episodeId, "seek-thumbnail");
  }

  return v.parse(seekThumbnailManifestSchema, record.seekThumbnailManifest);
}

export async function getSeekThumbnailSprite(
  db: Db,
  workId: string,
  episodeId: string,
): Promise<Uint8Array> {
  const record = await getSeekThumbnailRecord(db, workId, episodeId);
  if (record === undefined) {
    throw createSeekThumbnailNotFoundError(workId, episodeId, "seek-thumbnail");
  }

  if (await isSeekThumbnailStale(record, episodeId)) {
    if (record.seekThumbnailManifest !== null) {
      await clearSeekThumbnailManifest(db, episodeId);
    }

    throw createSeekThumbnailNotFoundError(workId, episodeId, "seek-thumbnail");
  }

  const filePath = resolveSeekThumbnailSpritePath(episodeId);
  try {
    return await readFile(filePath);
  } catch {
    await clearSeekThumbnailManifest(db, episodeId);
    throw createSeekThumbnailNotFoundError(workId, episodeId, SEEK_THUMBNAIL_SPRITE_FILE);
  }
}

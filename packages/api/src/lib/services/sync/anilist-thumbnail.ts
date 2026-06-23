import { and, eq, exists, isNotNull, isNull, or, sql } from "drizzle-orm";

import { fetchCoverImageByMalId } from "../../anilist.ts";
import { getAnnictToken, fetchWorkMalAnimeId } from "../../annict.ts";
import type { Db } from "../../db/index.ts";
import { episodes, type Work, works } from "../../db/schema.ts";
import { KeyedSerialQueue } from "../job-queue.ts";

export type AniListThumbnailFetchResult =
  | {
      status: "skipped";
      reason: "missing_token" | "missing_work" | "missing_annict_work" | "already_found";
    }
  | { status: "found" }
  | { status: "not_found" }
  | { status: "error" };

export interface AniListThumbnailFetchJob {
  db: Db;
  workId: string;
}

export interface AniListThumbnailFetchEnqueueResult {
  targeted: number;
  queued: number;
  alreadyQueued: number;
  rerunRequested: number;
}

function hasActiveEpisode(db: Db) {
  return exists(
    db
      .select({ id: sql`1` })
      .from(episodes)
      .where(and(eq(episodes.workId, works.id), eq(episodes.active, true))),
  );
}

async function listThumbnailSyncTargetWorks(db: Db, rootId: string) {
  return db
    .select()
    .from(works)
    .where(
      and(
        eq(works.rootId, rootId),
        isNotNull(works.annictWorkId),
        or(isNull(works.thumbnailStatus), eq(works.thumbnailStatus, "error")),
        hasActiveEpisode(db),
      ),
    );
}

async function updateWorkThumbnail(
  db: Db,
  workId: string,
  data: {
    malAnimeId: number | null;
    thumbnailUrl: string | null;
    thumbnailStatus: Work["thumbnailStatus"];
  },
): Promise<void> {
  await db.update(works).set(data).where(eq(works.id, workId));
}

function parseMalAnimeId(value: string | null): number | null {
  if (value === null || value.length === 0) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function refreshWorkThumbnail(
  db: Db,
  input: { workId: string; token: string },
): Promise<AniListThumbnailFetchResult> {
  if (input.token.length === 0) {
    return { status: "skipped", reason: "missing_token" };
  }

  const work = await db.query.works.findFirst({
    where: eq(works.id, input.workId),
  });

  if (work === undefined) {
    return { status: "skipped", reason: "missing_work" };
  }

  const annictWorkId = work.annictWorkId;
  if (annictWorkId === null) {
    return { status: "skipped", reason: "missing_annict_work" };
  }

  if (work.thumbnailStatus === "found") {
    return { status: "skipped", reason: "already_found" };
  }

  try {
    const malAnimeIdRaw = await fetchWorkMalAnimeId(annictWorkId, input.token);
    const malAnimeId = parseMalAnimeId(malAnimeIdRaw);

    if (malAnimeId === null) {
      await updateWorkThumbnail(db, work.id, {
        malAnimeId: null,
        thumbnailUrl: null,
        thumbnailStatus: "not_found",
      });
      return { status: "not_found" };
    }

    const thumbnailUrl = await fetchCoverImageByMalId(malAnimeId);

    if (thumbnailUrl === null) {
      await updateWorkThumbnail(db, work.id, {
        malAnimeId,
        thumbnailUrl: null,
        thumbnailStatus: "not_found",
      });
      return { status: "not_found" };
    }

    await updateWorkThumbnail(db, work.id, {
      malAnimeId,
      thumbnailUrl,
      thumbnailStatus: "found",
    });
    return { status: "found" };
  } catch (e) {
    console.error(e);
    await updateWorkThumbnail(db, work.id, {
      malAnimeId: work.malAnimeId,
      thumbnailUrl: work.thumbnailUrl,
      thumbnailStatus: "error",
    });
    return { status: "error" };
  }
}

async function runAniListThumbnailFetchJob(job: AniListThumbnailFetchJob): Promise<void> {
  const token = getAnnictToken();
  if (token === undefined) {
    return;
  }

  await refreshWorkThumbnail(job.db, { workId: job.workId, token });
}

const anilistThumbnailFetchQueue = new KeyedSerialQueue<AniListThumbnailFetchJob>({
  getKey: (job) => job.workId,
  logLabel: "anilist thumbnail fetch",
  run: runAniListThumbnailFetchJob,
});

export async function enqueueAniListThumbnailFetch(db: Db, workId: string): Promise<void> {
  await anilistThumbnailFetchQueue.enqueue({ db, workId });
}

export async function enqueueMissingAniListThumbnailFetches(
  db: Db,
  rootId: string,
): Promise<AniListThumbnailFetchEnqueueResult> {
  const targetWorks = await listThumbnailSyncTargetWorks(db, rootId);
  const result: AniListThumbnailFetchEnqueueResult = {
    targeted: targetWorks.length,
    queued: 0,
    alreadyQueued: 0,
    rerunRequested: 0,
  };

  for (const work of targetWorks) {
    const status = await anilistThumbnailFetchQueue.enqueue({ db, workId: work.id });
    if (status === "queued") {
      result.queued += 1;
    } else if (status === "already_queued") {
      result.alreadyQueued += 1;
    } else {
      result.rerunRequested += 1;
    }
  }

  return result;
}

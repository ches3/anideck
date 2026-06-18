import { and, eq, exists, isNotNull, isNull, or, sql } from "drizzle-orm";

import { fetchCoverImageByMalId } from "../anilist.ts";
import { fetchWorkMalAnimeId } from "../annict.ts";
import type { Db } from "../db/index.ts";
import { episodes, type Work, works } from "../db/schema.ts";

export type ThumbnailSyncResult =
  | { status: "skipped"; reason: "missing_token" }
  | { status: "success"; found: number; notFound: number; error: number };

export interface SyncWorkThumbnailsInput {
  rootId: string;
  token: string;
}

export const THUMBNAIL_SYNC_DELAY_MS = 300;

function hasActiveEpisode(db: Db) {
  return exists(
    db
      .select({ id: sql`1` })
      .from(episodes)
      .where(and(eq(episodes.workId, works.id), eq(episodes.active, true))),
  );
}

export async function listThumbnailSyncTargetWorks(db: Db, rootId: string) {
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

export async function updateWorkThumbnail(
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

export async function syncWorkThumbnails(
  db: Db,
  input: SyncWorkThumbnailsInput,
): Promise<ThumbnailSyncResult> {
  if (input.token.length === 0) {
    return { status: "skipped", reason: "missing_token" };
  }

  const targetWorks = await listThumbnailSyncTargetWorks(db, input.rootId);
  let found = 0;
  let notFound = 0;
  let error = 0;

  for (const work of targetWorks) {
    const annictWorkId = work.annictWorkId;
    if (annictWorkId === null) {
      continue;
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
        notFound += 1;
        continue;
      }

      const thumbnailUrl = await fetchCoverImageByMalId(malAnimeId);

      if (thumbnailUrl === null) {
        await updateWorkThumbnail(db, work.id, {
          malAnimeId,
          thumbnailUrl: null,
          thumbnailStatus: "not_found",
        });
        notFound += 1;
        continue;
      }

      await updateWorkThumbnail(db, work.id, {
        malAnimeId,
        thumbnailUrl,
        thumbnailStatus: "found",
      });
      found += 1;
    } catch (e) {
      console.error(e);
      await updateWorkThumbnail(db, work.id, {
        malAnimeId: work.malAnimeId,
        thumbnailUrl: work.thumbnailUrl,
        thumbnailStatus: "error",
      });
      error += 1;
    } finally {
      await new Promise((resolve) => setTimeout(resolve, THUMBNAIL_SYNC_DELAY_MS));
    }
  }

  return { status: "success", found, notFound, error };
}

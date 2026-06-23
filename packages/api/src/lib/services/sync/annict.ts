import { search } from "@anirec/annict";
import type { SearchResult } from "@anirec/annict";
import { and, eq, isNull, or } from "drizzle-orm";

import { getAnnictToken } from "../../annict.ts";
import type { Db } from "../../db/index.ts";
import { episodes, type Episode, works } from "../../db/schema.ts";
import { KeyedSerialQueue } from "../job-queue.ts";
import { enqueueAniListThumbnailFetch } from "./anilist-thumbnail.ts";

export const clearEpisodeAnnictFields = {
  annictEpisodeId: null,
  annictTitle: null,
  annictEpisodeNumber: null,
  annictEpisodeNumberText: null,
  annictNoEpisodes: null,
  annictStatus: null,
} as const;

export interface AnnictEpisodeSearchJob {
  db: Db;
  workId: string;
  episodeId: string;
}

export interface AnnictEpisodeSearchEnqueueResult {
  targeted: number;
  queued: number;
  alreadyQueued: number;
  rerunRequested: number;
}

async function listAnnictSyncTargetEpisodes(db: Db, rootId: string) {
  return db
    .select()
    .from(episodes)
    .where(
      and(
        eq(episodes.rootId, rootId),
        eq(episodes.active, true),
        or(isNull(episodes.annictStatus), eq(episodes.annictStatus, "error")),
      ),
    );
}

async function updateWorkAnnict(
  db: Db,
  workId: string,
  data: {
    annictWorkId: string;
    annictTitle: string;
  },
): Promise<void> {
  const existing = await db.query.works.findFirst({
    where: eq(works.id, workId),
  });

  const annictWorkIdChanged =
    existing !== undefined &&
    existing.annictWorkId !== null &&
    existing.annictWorkId !== data.annictWorkId;

  await db
    .update(works)
    .set({
      annictWorkId: data.annictWorkId,
      annictTitle: data.annictTitle,
      ...(annictWorkIdChanged
        ? {
            malAnimeId: null,
            thumbnailUrl: null,
            thumbnailStatus: null,
          }
        : {}),
    })
    .where(eq(works.id, workId));
}

async function updateEpisodeAnnict(
  db: Db,
  episodeId: string,
  data: {
    annictEpisodeId: string | null;
    annictTitle: string | null;
    annictEpisodeNumber: number | null;
    annictEpisodeNumberText: string | null;
    annictNoEpisodes: boolean | null;
    annictStatus: Episode["annictStatus"];
  },
): Promise<void> {
  await db.update(episodes).set(data).where(eq(episodes.id, episodeId));
}

async function updateEpisodeAnnictStatus(
  db: Db,
  episodeId: string,
  status: Episode["annictStatus"],
): Promise<void> {
  await db.update(episodes).set({ annictStatus: status }).where(eq(episodes.id, episodeId));
}

type AnnictEpisodeSearchInput = Pick<AnnictEpisodeSearchJob, "workId" | "episodeId">;

export async function refreshAnnictEpisode(
  db: Db,
  input: AnnictEpisodeSearchInput & { token: string },
): Promise<"matched" | "not_found" | "error" | "skipped"> {
  const { workId, episodeId, token } = input;
  if (token.length === 0) {
    return "skipped";
  }

  const episode = await db.query.episodes.findFirst({
    where: and(eq(episodes.id, episodeId), eq(episodes.workId, workId), eq(episodes.active, true)),
  });

  if (episode === undefined) {
    return "skipped";
  }

  try {
    const result: SearchResult = await search(
      {
        workTitle: episode.originalWorkTitle,
        episodeTitle: episode.originalTitle,
      },
      token,
    );

    if (result === undefined) {
      await updateEpisodeAnnict(db, episode.id, {
        annictEpisodeId: null,
        annictTitle: null,
        annictEpisodeNumber: null,
        annictEpisodeNumberText: null,
        annictNoEpisodes: null,
        annictStatus: "not_found",
      });
      return "not_found";
    }

    await updateWorkAnnict(db, episode.workId, {
      annictWorkId: result.id,
      annictTitle: result.title,
    });
    await enqueueAniListThumbnailFetch(db, episode.workId);

    if (result.episode !== undefined) {
      await updateEpisodeAnnict(db, episode.id, {
        annictEpisodeId: result.episode.id,
        annictTitle: result.episode.title ?? null,
        annictEpisodeNumber: result.episode.number ?? null,
        annictEpisodeNumberText: result.episode.numberText ?? null,
        annictNoEpisodes: false,
        annictStatus: "matched",
      });
      return "matched";
    }

    await updateEpisodeAnnict(db, episode.id, {
      annictEpisodeId: null,
      annictTitle: result.title,
      annictEpisodeNumber: null,
      annictEpisodeNumberText: null,
      annictNoEpisodes: true,
      annictStatus: "matched",
    });
    return "matched";
  } catch (e) {
    console.error(e);
    await updateEpisodeAnnictStatus(db, episode.id, "error");
    return "error";
  }
}

async function runAnnictEpisodeSearchJob(job: AnnictEpisodeSearchJob): Promise<void> {
  const token = getAnnictToken();
  if (token === undefined) {
    return;
  }

  const { db, workId, episodeId } = job;
  await refreshAnnictEpisode(db, {
    workId,
    episodeId,
    token,
  });
}

const annictEpisodeSearchQueue = new KeyedSerialQueue<AnnictEpisodeSearchJob>({
  getKey: (job) => job.episodeId,
  logLabel: "annict episode search",
  run: runAnnictEpisodeSearchJob,
});

export async function enqueuePendingAnnictEpisodeSearches(
  db: Db,
  rootId: string,
): Promise<AnnictEpisodeSearchEnqueueResult> {
  const targetEpisodes = await listAnnictSyncTargetEpisodes(db, rootId);
  const result: AnnictEpisodeSearchEnqueueResult = {
    targeted: targetEpisodes.length,
    queued: 0,
    alreadyQueued: 0,
    rerunRequested: 0,
  };

  for (const episode of targetEpisodes) {
    const status = await annictEpisodeSearchQueue.enqueue({
      db,
      workId: episode.workId,
      episodeId: episode.id,
    });
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

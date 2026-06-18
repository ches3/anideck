import { search } from "@anirec/annict";
import type { SearchResult } from "@anirec/annict";
import { and, eq, isNull, or } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { episodes, type Episode, works } from "../db/schema.ts";

export const clearEpisodeAnnictFields = {
  annictEpisodeId: null,
  annictTitle: null,
  annictEpisodeNumber: null,
  annictEpisodeNumberText: null,
  annictNoEpisodes: null,
  annictStatus: null,
} as const;

export type AnnictSyncResult =
  | { status: "skipped"; reason: "missing_token" }
  | { status: "success"; matched: number; notFound: number; error: number };

export interface SyncAnnictTitlesInput {
  rootId: string;
  token: string;
}

export async function listAnnictSyncTargetEpisodes(db: Db, rootId: string) {
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

export async function updateWorkAnnict(
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

export async function updateEpisodeAnnict(
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

export async function updateEpisodeAnnictStatus(
  db: Db,
  episodeId: string,
  status: Episode["annictStatus"],
): Promise<void> {
  await db.update(episodes).set({ annictStatus: status }).where(eq(episodes.id, episodeId));
}

export async function syncAnnictTitles(
  db: Db,
  input: SyncAnnictTitlesInput,
): Promise<AnnictSyncResult> {
  if (input.token.length === 0) {
    return { status: "skipped", reason: "missing_token" };
  }

  const targetEpisodes = await listAnnictSyncTargetEpisodes(db, input.rootId);
  let matched = 0;
  let notFound = 0;
  let error = 0;

  for (const episode of targetEpisodes) {
    try {
      const result: SearchResult = await search(
        {
          workTitle: episode.originalWorkTitle,
          episodeTitle: episode.originalTitle,
        },
        input.token,
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
        notFound += 1;
        continue;
      }

      await updateWorkAnnict(db, episode.workId, {
        annictWorkId: result.id,
        annictTitle: result.title,
      });

      if (result.episode !== undefined) {
        await updateEpisodeAnnict(db, episode.id, {
          annictEpisodeId: result.episode.id,
          annictTitle: result.episode.title ?? null,
          annictEpisodeNumber: result.episode.number ?? null,
          annictEpisodeNumberText: result.episode.numberText ?? null,
          annictNoEpisodes: false,
          annictStatus: "matched",
        });
        matched += 1;
        continue;
      }

      await updateEpisodeAnnict(db, episode.id, {
        annictEpisodeId: null,
        annictTitle: result.title,
        annictEpisodeNumber: null,
        annictEpisodeNumberText: null,
        annictNoEpisodes: true,
        annictStatus: "matched",
      });
      matched += 1;

      await new Promise((resolve) => setTimeout(resolve, 300));
    } catch (e) {
      console.error(e);
      await updateEpisodeAnnictStatus(db, episode.id, "error");
      error += 1;
    }
  }

  return { status: "success", matched, notFound, error };
}

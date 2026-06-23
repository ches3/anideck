import { join } from "node:path";

import { and, asc, eq, exists, sql } from "drizzle-orm";

import { createEpisodeNotFoundError, createWorkNotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { episodes, sourceRoots, works } from "../db/schema.ts";

const workDisplayTitle = sql<string>`coalesce(${works.annictTitle}, ${works.originalTitle})`;

interface EpisodeTitleFields {
  annictEpisodeNumberText: string | null;
  annictTitle: string | null;
  originalTitle: string;
}

export function resolveEpisodeDisplayTitle(episode: EpisodeTitleFields): string {
  if (episode.annictEpisodeNumberText !== null && episode.annictTitle !== null) {
    return `${episode.annictEpisodeNumberText} ${episode.annictTitle}`;
  }
  if (episode.annictTitle !== null) {
    return episode.annictTitle;
  }
  return episode.originalTitle;
}

function hasActiveEpisode(db: Db) {
  return exists(
    db
      .select({ id: sql`1` })
      .from(episodes)
      .where(and(eq(episodes.workId, works.id), eq(episodes.active, true))),
  );
}

export interface WorkSummary {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface WorkEpisodeSummary {
  id: string;
  title: string;
  path: string;
}

export interface WorkDetail extends WorkSummary {
  episodes: WorkEpisodeSummary[];
}

export interface WorkEpisodeDetail {
  work: WorkSummary;
  episode: WorkEpisodeSummary;
}

interface EpisodeSortFields {
  annictEpisodeNumber: number | null;
  annictEpisodeNumberText: string | null;
  originalTitle: string;
}

function compareNumericStrings(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function compareEpisodes(a: EpisodeSortFields, b: EpisodeSortFields): number {
  if (a.annictEpisodeNumber !== null && b.annictEpisodeNumber !== null) {
    const diff = a.annictEpisodeNumber - b.annictEpisodeNumber;
    if (diff !== 0) {
      return diff;
    }
  } else if (a.annictEpisodeNumber !== null) {
    return -1;
  } else if (b.annictEpisodeNumber !== null) {
    return 1;
  }

  if (a.annictEpisodeNumberText !== null && b.annictEpisodeNumberText !== null) {
    const diff = compareNumericStrings(a.annictEpisodeNumberText, b.annictEpisodeNumberText);
    if (diff !== 0) {
      return diff;
    }
  } else if (a.annictEpisodeNumberText !== null) {
    return -1;
  } else if (b.annictEpisodeNumberText !== null) {
    return 1;
  }

  return compareNumericStrings(a.originalTitle, b.originalTitle);
}

export async function listWorks(db: Db): Promise<WorkSummary[]> {
  const rows = await db
    .select({
      id: works.id,
      title: workDisplayTitle,
      thumbnailUrl: works.thumbnailUrl,
    })
    .from(works)
    .where(hasActiveEpisode(db))
    .orderBy(asc(workDisplayTitle), asc(works.rootId));

  return rows;
}

export async function getWork(db: Db, workId: string): Promise<WorkDetail> {
  const work = await db.query.works.findFirst({
    where: and(eq(works.id, workId), hasActiveEpisode(db)),
  });

  if (work === undefined) {
    throw createWorkNotFoundError(workId);
  }

  const rows = await db
    .select({
      id: episodes.id,
      annictTitle: episodes.annictTitle,
      annictEpisodeNumber: episodes.annictEpisodeNumber,
      annictEpisodeNumberText: episodes.annictEpisodeNumberText,
      originalTitle: episodes.originalTitle,
      rootPath: sourceRoots.path,
      relativePath: episodes.relativePath,
    })
    .from(episodes)
    .innerJoin(sourceRoots, eq(episodes.rootId, sourceRoots.id))
    .where(and(eq(episodes.workId, workId), eq(episodes.active, true)));

  return {
    id: work.id,
    title: work.annictTitle ?? work.originalTitle,
    thumbnailUrl: work.thumbnailUrl,
    episodes: rows
      .map((row) => ({
        id: row.id,
        title: resolveEpisodeDisplayTitle(row),
        path: join(row.rootPath, row.relativePath),
        annictEpisodeNumber: row.annictEpisodeNumber,
        annictEpisodeNumberText: row.annictEpisodeNumberText,
        originalTitle: row.originalTitle,
      }))
      .sort(compareEpisodes)
      .map(({ id, title, path }) => ({ id, title, path })),
  };
}

export async function getWorkEpisode(
  db: Db,
  workId: string,
  episodeId: string,
): Promise<WorkEpisodeDetail> {
  const work = await db.query.works.findFirst({
    where: and(eq(works.id, workId), hasActiveEpisode(db)),
  });

  if (work === undefined) {
    throw createWorkNotFoundError(workId);
  }

  const episode = await db
    .select({
      id: episodes.id,
      annictTitle: episodes.annictTitle,
      annictEpisodeNumberText: episodes.annictEpisodeNumberText,
      originalTitle: episodes.originalTitle,
      rootPath: sourceRoots.path,
      relativePath: episodes.relativePath,
    })
    .from(episodes)
    .innerJoin(sourceRoots, eq(episodes.rootId, sourceRoots.id))
    .where(and(eq(episodes.id, episodeId), eq(episodes.workId, workId), eq(episodes.active, true)))
    .get();

  if (episode === undefined) {
    throw createEpisodeNotFoundError(workId, episodeId);
  }

  return {
    work: {
      id: work.id,
      title: work.annictTitle ?? work.originalTitle,
      thumbnailUrl: work.thumbnailUrl,
    },
    episode: {
      id: episode.id,
      title: resolveEpisodeDisplayTitle(episode),
      path: join(episode.rootPath, episode.relativePath),
    },
  };
}

import { join } from "node:path";

import { and, asc, eq, exists, sql } from "drizzle-orm";

import { createEpisodeNotFoundError, createWorkNotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { episodes, sourceRoots, works } from "../db/schema.ts";

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
}

export interface WorkEpisode {
  id: string;
  title: string;
  path: string;
}

export interface WorkDetail extends WorkSummary {
  episodes: WorkEpisode[];
}

export interface WorkEpisodeDetail {
  work: WorkSummary;
  episode: WorkEpisode;
}

export async function listWorks(db: Db): Promise<WorkSummary[]> {
  const rows = await db
    .select({
      id: works.id,
      title: works.originalTitle,
    })
    .from(works)
    .where(hasActiveEpisode(db))
    .orderBy(asc(works.originalTitle), asc(works.rootId));

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
      title: episodes.originalTitle,
      rootPath: sourceRoots.path,
      relativePath: episodes.relativePath,
    })
    .from(episodes)
    .innerJoin(sourceRoots, eq(episodes.rootId, sourceRoots.id))
    .where(and(eq(episodes.workId, workId), eq(episodes.active, true)));

  return {
    id: work.id,
    title: work.originalTitle,
    episodes: rows
      .map((row) => ({
        id: row.id,
        title: row.title,
        path: join(row.rootPath, row.relativePath),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })),
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
      title: episodes.originalTitle,
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
      title: work.originalTitle,
    },
    episode: {
      id: episode.id,
      title: episode.title,
      path: join(episode.rootPath, episode.relativePath),
    },
  };
}

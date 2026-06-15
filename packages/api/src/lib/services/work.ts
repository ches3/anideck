import { join } from "node:path";

import { createWorkNotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import { listSourceFiles } from "./source-file.ts";
import { listSourceRoots } from "./source-root.ts";

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

interface ResolvedSourceFile {
  rootId: string;
  rootPath: string;
  relativePath: string;
  workTitle: string;
  episodeTitle: string;
}

async function listResolvedSourceFiles(db: Db): Promise<ResolvedSourceFile[]> {
  const sourceRoots = await listSourceRoots(db);
  const resolvedFiles: ResolvedSourceFile[] = [];

  for (const sourceRoot of sourceRoots) {
    const files = await listSourceFiles(db, sourceRoot.id);
    for (const file of files) {
      if (file.title === null) {
        continue;
      }

      resolvedFiles.push({
        rootId: sourceRoot.id,
        rootPath: sourceRoot.path,
        relativePath: file.relativePath,
        workTitle: file.title.work,
        episodeTitle: file.title.episode,
      });
    }
  }

  return resolvedFiles;
}

function toWorkSummaries(files: ResolvedSourceFile[]): WorkSummary[] {
  const worksByTitle = new Map<string, WorkSummary>();

  for (const file of files) {
    if (worksByTitle.has(file.workTitle)) {
      continue;
    }

    worksByTitle.set(file.workTitle, {
      id: createWorkId(file.workTitle),
      title: file.workTitle,
    });
  }

  return [...worksByTitle.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function toWorkDetail(files: ResolvedSourceFile[], workId: string): WorkDetail {
  const matchingFiles = files.filter((file) => createWorkId(file.workTitle) === workId);
  if (matchingFiles.length === 0) {
    throw createWorkNotFoundError(workId);
  }

  const workTitle = matchingFiles[0].workTitle;

  return {
    id: workId,
    title: workTitle,
    episodes: matchingFiles
      .map((file) => ({
        id: createEpisodeId(file.rootId, file.relativePath),
        title: file.episodeTitle,
        path: join(file.rootPath, file.relativePath),
      }))
      .sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true })),
  };
}

export async function listWorks(db: Db): Promise<WorkSummary[]> {
  const files = await listResolvedSourceFiles(db);
  return toWorkSummaries(files);
}

export async function getWork(db: Db, workId: string): Promise<WorkDetail> {
  const files = await listResolvedSourceFiles(db);
  return toWorkDetail(files, workId);
}

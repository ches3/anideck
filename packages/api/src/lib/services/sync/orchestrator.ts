import { AppError } from "../../../errors/index.ts";
import type { Db } from "../../db/index.ts";
import {
  enqueueStaleSeekThumbnailGenerations,
  type SeekThumbnailGenerationEnqueueResult,
} from "../seek-thumbnail.ts";
import { listSourceFiles } from "../source-file.ts";
import { listSourceRoots } from "../source-root.ts";
import {
  enqueueMissingAniListThumbnailFetches,
  type AniListThumbnailFetchEnqueueResult,
} from "./anilist-thumbnail.ts";
import {
  enqueuePendingAnnictEpisodeSearches,
  type AnnictEpisodeSearchEnqueueResult,
} from "./annict.ts";
import { applyCatalogDiff, buildScannedEpisodeMap, type CatalogDiffResult } from "./catalog.ts";

export interface SourceSyncJobsResult {
  annictEpisodeSearches: AnnictEpisodeSearchEnqueueResult;
  anilistThumbnailFetches: AniListThumbnailFetchEnqueueResult;
  seekThumbnailGenerations: SeekThumbnailGenerationEnqueueResult;
}

export interface SourceSyncResult {
  files: CatalogDiffResult;
  jobs: SourceSyncJobsResult;
}

export interface SourceSyncStatusBySource {
  rootId: string;
  sync: SourceSyncStatus;
}

export interface AllSourcesSyncResult {
  sources: SourceSyncStatusBySource[];
}

export type SourceSyncStatus =
  | {
      status: "success";
      files: CatalogDiffResult;
      jobs: SourceSyncJobsResult;
    }
  | {
      status: "failed";
      error: string;
    };

const runningSyncPromises = new Map<string, Promise<void>>();
const rerunRequestedRootIds = new Set<string>();

async function enqueueSourceSyncJobs(db: Db, rootId: string): Promise<SourceSyncJobsResult> {
  const [seekThumbnailGenerations, annictEpisodeSearches, anilistThumbnailFetches] =
    await Promise.all([
      enqueueStaleSeekThumbnailGenerations(db, rootId),
      enqueuePendingAnnictEpisodeSearches(db, rootId),
      enqueueMissingAniListThumbnailFetches(db, rootId),
    ]);

  return {
    annictEpisodeSearches,
    anilistThumbnailFetches,
    seekThumbnailGenerations,
  };
}

export async function syncSource(db: Db, rootId: string): Promise<SourceSyncResult> {
  const files = await listSourceFiles(db, rootId);
  const scannedEpisodes = buildScannedEpisodeMap(rootId, files);

  const diff = await applyCatalogDiff(db, rootId, scannedEpisodes);
  const jobs = await enqueueSourceSyncJobs(db, rootId);

  return { files: diff, jobs };
}

export async function trySyncSource(db: Db, rootId: string): Promise<SourceSyncStatus> {
  try {
    const result = await syncSource(db, rootId);
    return {
      status: "success",
      files: result.files,
      jobs: result.jobs,
    };
  } catch (error) {
    console.error("Source sync failed", error);

    const errorMessage = error instanceof AppError ? error.message : "source 同期に失敗しました";

    return {
      status: "failed",
      error: errorMessage,
    };
  }
}

export function triggerSourceSync(db: Db, rootId: string): Promise<void> {
  const runningSyncPromise = runningSyncPromises.get(rootId);
  if (runningSyncPromise !== undefined) {
    rerunRequestedRootIds.add(rootId);
    return runningSyncPromise;
  }

  return startSourceSync(db, rootId);
}

function startSourceSync(db: Db, rootId: string): Promise<void> {
  const syncPromise: Promise<void> = runSourceSyncLoop(db, rootId).finally(() => {
    runningSyncPromises.delete(rootId);
    rerunRequestedRootIds.delete(rootId);
  });

  runningSyncPromises.set(rootId, syncPromise);
  return syncPromise;
}

async function runSourceSyncLoop(db: Db, rootId: string): Promise<void> {
  do {
    rerunRequestedRootIds.delete(rootId);
    await trySyncSource(db, rootId);
  } while (rerunRequestedRootIds.has(rootId));
}

export async function syncAllSources(db: Db): Promise<AllSourcesSyncResult> {
  const sourceRoots = await listSourceRoots(db);
  const sources: SourceSyncStatusBySource[] = [];

  for (const sourceRoot of sourceRoots) {
    sources.push({
      rootId: sourceRoot.id,
      sync: await trySyncSource(db, sourceRoot.id),
    });
  }

  return { sources };
}

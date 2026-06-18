import { eq } from "drizzle-orm";

import { AppError } from "../../errors/index.ts";
import { getAnnictToken } from "../annict.ts";
import type { Db, DbOrTransaction } from "../db/index.ts";
import { episodes, works } from "../db/schema.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import {
  clearEpisodeAnnictFields,
  syncAnnictTitles,
  type AnnictSyncResult,
} from "./annict-sync.ts";
import type { SourceFileRecord } from "./source-file.ts";

export interface ScannedEpisode {
  rootId: string;
  relativePath: string;
  originalWorkTitle: string;
  originalTitle: string;
}

export type ScannedEpisodeMap = Map<string, ScannedEpisode>;

export interface RootCatalogSyncStatus {
  rootId: string;
  sync: CatalogSyncStatus;
}

export interface AllCatalogSyncResult {
  roots: RootCatalogSyncStatus[];
}

export type CatalogSyncStatus =
  | {
      status: "success";
      annict: AnnictSyncResult;
    }
  | {
      status: "failed";
      error: string;
    };

export interface CatalogSyncResult {
  annict: AnnictSyncResult;
}

function createEpisodeKey(rootId: string, relativePath: string): string {
  return `${rootId}\0${relativePath}`;
}

function hasTitleChanged(
  episode: {
    originalWorkTitle: string;
    originalTitle: string;
  },
  scanned: ScannedEpisode,
): boolean {
  return (
    episode.originalWorkTitle !== scanned.originalWorkTitle ||
    episode.originalTitle !== scanned.originalTitle
  );
}

async function ensureWork(
  tx: DbOrTransaction,
  rootId: string,
  originalTitle: string,
): Promise<string> {
  const workId = createWorkId(rootId, originalTitle);
  const existing = await tx.query.works.findFirst({
    where: eq(works.id, workId),
  });

  if (existing === undefined) {
    await tx.insert(works).values({
      id: workId,
      rootId,
      originalTitle,
    });
  }

  return workId;
}

export async function applyCatalogDiff(
  tx: DbOrTransaction,
  rootId: string,
  scannedEpisodes: ScannedEpisodeMap,
): Promise<void> {
  const existingEpisodes = await tx.select().from(episodes).where(eq(episodes.rootId, rootId));

  const existingByKey = new Map(
    existingEpisodes.map((episode) => [
      createEpisodeKey(episode.rootId, episode.relativePath),
      episode,
    ]),
  );
  const scannedKeys = new Set(scannedEpisodes.keys());

  for (const scanned of scannedEpisodes.values()) {
    const key = createEpisodeKey(scanned.rootId, scanned.relativePath);
    const existing = existingByKey.get(key);

    if (existing === undefined) {
      const workId = await ensureWork(tx, rootId, scanned.originalWorkTitle);
      await tx.insert(episodes).values({
        id: createEpisodeId(rootId, scanned.relativePath),
        workId,
        rootId,
        relativePath: scanned.relativePath,
        originalWorkTitle: scanned.originalWorkTitle,
        originalTitle: scanned.originalTitle,
        active: true,
      });
      continue;
    }

    if (!existing.active) {
      const workId = await ensureWork(tx, rootId, scanned.originalWorkTitle);
      const shouldClearAnnict = hasTitleChanged(existing, scanned);
      await tx
        .update(episodes)
        .set({
          workId,
          originalWorkTitle: scanned.originalWorkTitle,
          originalTitle: scanned.originalTitle,
          active: true,
          ...(shouldClearAnnict ? clearEpisodeAnnictFields : {}),
        })
        .where(eq(episodes.id, existing.id));
      continue;
    }

    if (hasTitleChanged(existing, scanned)) {
      const workId = await ensureWork(tx, rootId, scanned.originalWorkTitle);
      await tx
        .update(episodes)
        .set({
          workId,
          originalWorkTitle: scanned.originalWorkTitle,
          originalTitle: scanned.originalTitle,
          ...clearEpisodeAnnictFields,
        })
        .where(eq(episodes.id, existing.id));
    }
  }

  for (const existing of existingEpisodes) {
    const key = createEpisodeKey(existing.rootId, existing.relativePath);
    if (!scannedKeys.has(key) && existing.active) {
      await tx.update(episodes).set({ active: false }).where(eq(episodes.id, existing.id));
    }
  }
}

export function buildScannedEpisodeMap(
  rootId: string,
  files: SourceFileRecord[],
): ScannedEpisodeMap {
  const scannedEpisodes: ScannedEpisodeMap = new Map();

  for (const file of files) {
    if (file.title === null) {
      continue;
    }

    scannedEpisodes.set(createEpisodeKey(rootId, file.relativePath), {
      rootId,
      relativePath: file.relativePath,
      originalWorkTitle: file.title.work,
      originalTitle: file.title.episode,
    });
  }

  return scannedEpisodes;
}

export async function syncSourceRootCatalog(db: Db, rootId: string): Promise<CatalogSyncResult> {
  const { listSourceFiles } = await import("./source-file.ts");
  const files = await listSourceFiles(db, rootId);
  const scannedEpisodes = buildScannedEpisodeMap(rootId, files);

  await db.transaction(async (tx) => applyCatalogDiff(tx, rootId, scannedEpisodes));

  const annict = await syncAnnictTitles(db, {
    rootId,
    token: getAnnictToken() ?? "",
  });

  return { annict };
}

export async function trySyncSourceRootCatalog(db: Db, rootId: string): Promise<CatalogSyncStatus> {
  try {
    const result = await syncSourceRootCatalog(db, rootId);
    return {
      status: "success",
      annict: result.annict,
    };
  } catch (error) {
    console.error("Catalog sync failed", error);

    const errorMessage = error instanceof AppError ? error.message : "カタログ同期に失敗しました";

    return {
      status: "failed",
      error: errorMessage,
    };
  }
}

export async function syncAllSourceRootCatalogs(db: Db): Promise<AllCatalogSyncResult> {
  const { listSourceRoots } = await import("./source-root.ts");
  const sourceRoots = await listSourceRoots(db);
  const roots: RootCatalogSyncStatus[] = [];

  for (const sourceRoot of sourceRoots) {
    roots.push({
      rootId: sourceRoot.id,
      sync: await trySyncSourceRootCatalog(db, sourceRoot.id),
    });
  }

  return { roots };
}

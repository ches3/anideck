import { eq } from "drizzle-orm";

import type { Db, DbOrTransaction } from "../../db/index.ts";
import { episodes, works } from "../../db/schema.ts";
import { createEpisodeId, createWorkId } from "../../work-id.ts";
import type { SourceFileRecord } from "../source-file.ts";
import { clearEpisodeAnnictFields } from "./annict.ts";

export interface ScannedEpisode {
  rootId: string;
  relativePath: string;
  originalWorkTitle: string;
  originalTitle: string;
}

export type ScannedEpisodeMap = Map<string, ScannedEpisode>;

export interface CatalogDiffResult {
  added: number;
  updated: number;
  deactivated: number;
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
  db: Db,
  rootId: string,
  scannedEpisodes: ScannedEpisodeMap,
): Promise<CatalogDiffResult> {
  return db.transaction(async (tx) => {
    const result: CatalogDiffResult = {
      added: 0,
      updated: 0,
      deactivated: 0,
    };

    const existingEpisodes = await tx.select().from(episodes).where(eq(episodes.rootId, rootId));

    const existingByKey = new Map(
      existingEpisodes.map((episode) => [
        createEpisodeKey(episode.rootId, episode.relativePath),
        episode,
      ]),
    );

    for (const [key, scanned] of scannedEpisodes) {
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
        result.added += 1;
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
        result.updated += 1;
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
        result.updated += 1;
      }
    }

    for (const [key, existing] of existingByKey) {
      if (!scannedEpisodes.has(key) && existing.active) {
        await tx.update(episodes).set({ active: false }).where(eq(episodes.id, existing.id));
        result.deactivated += 1;
      }
    }

    return result;
  });
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

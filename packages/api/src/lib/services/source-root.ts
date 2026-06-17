import * as fs from "node:fs/promises";

import { and, eq } from "drizzle-orm";
import { ulid } from "ulid";

import {
  AppError,
  createInsertReturnedNoRowsError,
  createSourceRootNotFoundError,
  createSourceRootPathError,
} from "../../errors/index.ts";
import type { Db, DbOrTransaction } from "../db/index.ts";
import { episodes, sourceRoots } from "../db/schema.ts";
import { classifySourceRootPathFailure } from "../fs-error.ts";
import { type CatalogSyncStatus, trySyncSourceRootCatalog } from "./catalog-sync.ts";

export interface SourceRootRecord {
  id: string;
  path: string;
}

export interface SourceRootMutationResult extends SourceRootRecord {
  sync: CatalogSyncStatus;
}

async function deactivateSourceRootEpisodes(tx: DbOrTransaction, rootId: string): Promise<void> {
  await tx
    .update(episodes)
    .set({ active: false })
    .where(and(eq(episodes.rootId, rootId), eq(episodes.active, true)));
}

export async function assertSourceRootPathAvailable(path: string): Promise<void> {
  try {
    const stats = await fs.stat(path);
    if (!stats.isDirectory()) {
      throw createSourceRootPathError("not_directory", path);
    }
    const dir = await fs.opendir(path);
    try {
      await dir.read();
    } finally {
      await dir.close();
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createSourceRootPathError(classifySourceRootPathFailure(error), path, error);
  }
}

export async function listSourceRoots(db: Db): Promise<SourceRootRecord[]> {
  const rows = await db.select().from(sourceRoots);

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
  }));
}

export async function createSourceRoot(db: Db, input: { path: string }): Promise<SourceRootRecord> {
  await assertSourceRootPathAvailable(input.path);

  const result = await db
    .insert(sourceRoots)
    .values({
      id: ulid(),
      path: input.path,
    })
    .returning();

  if (result.length === 0) {
    throw createInsertReturnedNoRowsError("source_roots");
  }

  const created = result[0];

  return {
    id: created.id,
    path: created.path,
  };
}

export async function updateSourceRoot(
  db: Db,
  rootId: string,
  input: { path: string },
): Promise<SourceRootMutationResult> {
  const existing = await getSourceRoot(db, rootId);
  if (existing === null) {
    throw createSourceRootNotFoundError(rootId);
  }

  await assertSourceRootPathAvailable(input.path);

  const updated = await db.transaction(async (tx) => {
    const result = await tx
      .update(sourceRoots)
      .set({ path: input.path })
      .where(eq(sourceRoots.id, rootId))
      .returning();

    if (result.length === 0) {
      throw createSourceRootNotFoundError(rootId);
    }

    await deactivateSourceRootEpisodes(tx, rootId);

    return result[0];
  });

  const sync = await trySyncSourceRootCatalog(db, rootId);

  return {
    id: updated.id,
    path: updated.path,
    sync,
  };
}

export async function deleteSourceRoot(db: Db, rootId: string): Promise<void> {
  const result = await db.delete(sourceRoots).where(eq(sourceRoots.id, rootId)).returning();

  if (result.length === 0) {
    throw createSourceRootNotFoundError(rootId);
  }
}

export async function assertSourceRootExists(db: Db, rootId: string): Promise<void> {
  const root = await db.query.sourceRoots.findFirst({
    where: eq(sourceRoots.id, rootId),
  });

  if (root === undefined) {
    throw createSourceRootNotFoundError(rootId);
  }
}

export async function getSourceRoot(db: Db, rootId: string): Promise<SourceRootRecord | null> {
  const root = await db.query.sourceRoots.findFirst({
    where: eq(sourceRoots.id, rootId),
  });

  if (root === undefined) {
    return null;
  }

  return {
    id: root.id,
    path: root.path,
  };
}

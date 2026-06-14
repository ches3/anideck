import * as fs from "node:fs/promises";

import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import {
  AppError,
  createInsertReturnedNoRowsError,
  createSourceRootNotFoundError,
  createSourceRootPathError,
} from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { sourceRoots } from "../db/schema.ts";
import { classifySourceRootPathFailure } from "../fs-error.ts";

export interface SourceRootRecord {
  id: string;
  path: string;
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
): Promise<SourceRootRecord> {
  const existing = await getSourceRoot(db, rootId);
  if (existing === null) {
    throw createSourceRootNotFoundError(rootId);
  }

  await assertSourceRootPathAvailable(input.path);

  const result = await db
    .update(sourceRoots)
    .set({ path: input.path })
    .where(eq(sourceRoots.id, rootId))
    .returning();

  if (result.length === 0) {
    throw createSourceRootNotFoundError(rootId);
  }

  const updated = result[0];

  return {
    id: updated.id,
    path: updated.path,
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

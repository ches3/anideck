import { eq } from "drizzle-orm";
import { ulid } from "ulid";

import {
  createInsertReturnedNoRowsError,
  createSourceRootNotFoundError,
} from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { sourceRoots } from "../db/schema.ts";

export interface SourceRootRecord {
  id: string;
  path: string;
}

export async function listSourceRoots(db: Db): Promise<SourceRootRecord[]> {
  const rows = await db.select().from(sourceRoots);

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
  }));
}

export async function createSourceRoot(db: Db, input: { path: string }): Promise<SourceRootRecord> {
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

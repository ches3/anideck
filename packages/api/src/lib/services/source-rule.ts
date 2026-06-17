import { asc, eq, max } from "drizzle-orm";
import { ulid } from "ulid";

import {
  createDuplicatePatternError,
  createDuplicateSortOrderError,
  createExcludeRuleNotFoundError,
  createIncludeRuleNotFoundError,
  createInsertReturnedNoRowsError,
  createSourceRootNotFoundError,
} from "../../errors/index.ts";
import { isSqliteForeignKeyConstraintError, isSqliteUniqueConstraintError } from "../db/errors.ts";
import type { Db } from "../db/index.ts";
import { sourceExcludeRules, sourceIncludeRules } from "../db/schema.ts";
import { type CatalogSyncStatus, trySyncSourceRootCatalog } from "./catalog-sync.ts";
import { assertSourceRootExists } from "./source-root.ts";

export interface SourceRuleRecord {
  id: string;
  rootId: string;
  pattern: string;
  sortOrder: number;
}

export type SourceRuleSyncResult = CatalogSyncStatus;

export interface SourceRuleMutationResult extends SourceRuleRecord {
  sync: SourceRuleSyncResult;
}

export interface SourceRuleDeleteResult {
  sync: SourceRuleSyncResult;
}

function toRuleRecord(row: {
  id: string;
  rootId: string;
  pattern: string;
  sortOrder: number;
}): SourceRuleRecord {
  return {
    id: row.id,
    rootId: row.rootId,
    pattern: row.pattern,
    sortOrder: row.sortOrder,
  };
}

function nextSortOrder(currentMax: number | null): number {
  if (currentMax === null) {
    return 0;
  }
  return currentMax + 1;
}

function isIncludeRulePatternUniqueConstraintError(error: unknown): boolean {
  return isSqliteUniqueConstraintError(error, [
    "source_include_rules.root_id",
    "source_include_rules.pattern",
  ]);
}

function isIncludeRuleSortOrderUniqueConstraintError(error: unknown): boolean {
  return isSqliteUniqueConstraintError(error, [
    "source_include_rules.root_id",
    "source_include_rules.sort_order",
  ]);
}

function isExcludeRulePatternUniqueConstraintError(error: unknown): boolean {
  return isSqliteUniqueConstraintError(error, [
    "source_exclude_rules.root_id",
    "source_exclude_rules.pattern",
  ]);
}

function isExcludeRuleSortOrderUniqueConstraintError(error: unknown): boolean {
  return isSqliteUniqueConstraintError(error, [
    "source_exclude_rules.root_id",
    "source_exclude_rules.sort_order",
  ]);
}

async function resolveNextIncludeRuleSortOrder(db: Db, rootId: string): Promise<number> {
  const result = await db
    .select({ value: max(sourceIncludeRules.sortOrder) })
    .from(sourceIncludeRules)
    .where(eq(sourceIncludeRules.rootId, rootId));
  return nextSortOrder(result[0].value);
}

async function resolveNextExcludeRuleSortOrder(db: Db, rootId: string): Promise<number> {
  const result = await db
    .select({ value: max(sourceExcludeRules.sortOrder) })
    .from(sourceExcludeRules)
    .where(eq(sourceExcludeRules.rootId, rootId));
  return nextSortOrder(result[0].value);
}

export async function listSourceIncludeRules(db: Db, rootId: string): Promise<SourceRuleRecord[]> {
  await assertSourceRootExists(db, rootId);

  const rows = await db
    .select()
    .from(sourceIncludeRules)
    .where(eq(sourceIncludeRules.rootId, rootId))
    .orderBy(asc(sourceIncludeRules.sortOrder));

  return rows.map(toRuleRecord);
}

export async function listSourceExcludeRules(db: Db, rootId: string): Promise<SourceRuleRecord[]> {
  await assertSourceRootExists(db, rootId);

  const rows = await db
    .select()
    .from(sourceExcludeRules)
    .where(eq(sourceExcludeRules.rootId, rootId))
    .orderBy(asc(sourceExcludeRules.sortOrder));

  return rows.map(toRuleRecord);
}

export async function createSourceIncludeRule(
  db: Db,
  input: {
    rootId: string;
    pattern: string;
    sortOrder?: number;
  },
): Promise<SourceRuleMutationResult> {
  const sortOrder = input.sortOrder ?? (await resolveNextIncludeRuleSortOrder(db, input.rootId));

  let result;

  try {
    result = await db
      .insert(sourceIncludeRules)
      .values({
        id: ulid(),
        rootId: input.rootId,
        pattern: input.pattern,
        sortOrder,
      })
      .returning();
  } catch (error) {
    if (isIncludeRulePatternUniqueConstraintError(error)) {
      throw createDuplicatePatternError(input.pattern);
    }
    if (isIncludeRuleSortOrderUniqueConstraintError(error)) {
      throw createDuplicateSortOrderError(sortOrder);
    }
    if (isSqliteForeignKeyConstraintError(error)) {
      throw createSourceRootNotFoundError(input.rootId);
    }
    throw error;
  }

  if (result.length === 0) {
    throw createInsertReturnedNoRowsError("source_include_rules");
  }

  const rule = toRuleRecord(result[0]);
  return {
    ...rule,
    sync: await trySyncSourceRootCatalog(db, rule.rootId),
  };
}

export async function createSourceExcludeRule(
  db: Db,
  input: {
    rootId: string;
    pattern: string;
    sortOrder?: number;
  },
): Promise<SourceRuleMutationResult> {
  const sortOrder = input.sortOrder ?? (await resolveNextExcludeRuleSortOrder(db, input.rootId));

  let result;

  try {
    result = await db
      .insert(sourceExcludeRules)
      .values({
        id: ulid(),
        rootId: input.rootId,
        pattern: input.pattern,
        sortOrder,
      })
      .returning();
  } catch (error) {
    if (isExcludeRulePatternUniqueConstraintError(error)) {
      throw createDuplicatePatternError(input.pattern);
    }
    if (isExcludeRuleSortOrderUniqueConstraintError(error)) {
      throw createDuplicateSortOrderError(sortOrder);
    }
    if (isSqliteForeignKeyConstraintError(error)) {
      throw createSourceRootNotFoundError(input.rootId);
    }
    throw error;
  }

  if (result.length === 0) {
    throw createInsertReturnedNoRowsError("source_exclude_rules");
  }

  const rule = toRuleRecord(result[0]);
  return {
    ...rule,
    sync: await trySyncSourceRootCatalog(db, rule.rootId),
  };
}

export async function updateSourceIncludeRule(
  db: Db,
  ruleId: string,
  input: {
    pattern?: string;
    sortOrder?: number;
  },
): Promise<SourceRuleMutationResult> {
  let result;

  try {
    result = await db
      .update(sourceIncludeRules)
      .set({
        pattern: input.pattern,
        sortOrder: input.sortOrder,
      })
      .where(eq(sourceIncludeRules.id, ruleId))
      .returning();
  } catch (error) {
    if (input.pattern !== undefined && isIncludeRulePatternUniqueConstraintError(error)) {
      throw createDuplicatePatternError(input.pattern);
    }
    if (input.sortOrder !== undefined && isIncludeRuleSortOrderUniqueConstraintError(error)) {
      throw createDuplicateSortOrderError(input.sortOrder);
    }
    throw error;
  }

  if (result.length === 0) {
    throw createIncludeRuleNotFoundError(ruleId);
  }

  const rule = toRuleRecord(result[0]);
  return {
    ...rule,
    sync: await trySyncSourceRootCatalog(db, rule.rootId),
  };
}

export async function updateSourceExcludeRule(
  db: Db,
  ruleId: string,
  input: {
    pattern?: string;
    sortOrder?: number;
  },
): Promise<SourceRuleMutationResult> {
  let result;

  try {
    result = await db
      .update(sourceExcludeRules)
      .set({
        pattern: input.pattern,
        sortOrder: input.sortOrder,
      })
      .where(eq(sourceExcludeRules.id, ruleId))
      .returning();
  } catch (error) {
    if (input.pattern !== undefined && isExcludeRulePatternUniqueConstraintError(error)) {
      throw createDuplicatePatternError(input.pattern);
    }
    if (input.sortOrder !== undefined && isExcludeRuleSortOrderUniqueConstraintError(error)) {
      throw createDuplicateSortOrderError(input.sortOrder);
    }
    throw error;
  }

  if (result.length === 0) {
    throw createExcludeRuleNotFoundError(ruleId);
  }

  const rule = toRuleRecord(result[0]);
  return {
    ...rule,
    sync: await trySyncSourceRootCatalog(db, rule.rootId),
  };
}

export async function deleteSourceIncludeRule(
  db: Db,
  ruleId: string,
): Promise<SourceRuleDeleteResult> {
  const result = await db
    .delete(sourceIncludeRules)
    .where(eq(sourceIncludeRules.id, ruleId))
    .returning();

  if (result.length === 0) {
    throw createIncludeRuleNotFoundError(ruleId);
  }

  return {
    sync: await trySyncSourceRootCatalog(db, result[0].rootId),
  };
}

export async function deleteSourceExcludeRule(
  db: Db,
  ruleId: string,
): Promise<SourceRuleDeleteResult> {
  const result = await db
    .delete(sourceExcludeRules)
    .where(eq(sourceExcludeRules.id, ruleId))
    .returning();

  if (result.length === 0) {
    throw createExcludeRuleNotFoundError(ruleId);
  }

  return {
    sync: await trySyncSourceRootCatalog(db, result[0].rootId),
  };
}

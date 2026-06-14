import { BadRequestError, ConflictError, InternalError, NotFoundError } from "./classes.ts";

export type SourceRootPathErrorReason = "not_found" | "not_directory" | "unreadable";

export function createSourceRootPathError(
  reason: SourceRootPathErrorReason,
  path: string,
  cause?: unknown,
) {
  const messages: Record<SourceRootPathErrorReason, string> = {
    not_found: "指定されたパスは存在しません",
    not_directory: "指定されたパスはフォルダではありません",
    unreadable: "指定されたフォルダを読み取れません",
  };

  return new BadRequestError(messages[reason], { path }, cause);
}

export function createSourceRootNotFoundError(rootId?: string) {
  return new NotFoundError(
    "source root が見つかりません",
    rootId !== undefined ? { rootId } : undefined,
  );
}

export function createIncludeRuleNotFoundError(ruleId?: string) {
  return new NotFoundError(
    "include rule が見つかりません",
    ruleId !== undefined ? { ruleId } : undefined,
  );
}

export function createExcludeRuleNotFoundError(ruleId?: string) {
  return new NotFoundError(
    "exclude rule が見つかりません",
    ruleId !== undefined ? { ruleId } : undefined,
  );
}

export function createDuplicatePatternError(pattern: string) {
  return new ConflictError("同一のルールが既に存在します", {
    pattern,
  });
}

export function createDuplicateSortOrderError(sortOrder: number) {
  return new ConflictError("sortOrder が重複しています", {
    sortOrder,
  });
}

export function createInsertReturnedNoRowsError(table: string) {
  return new InternalError("作成したレコードの取得に失敗しました", { table });
}

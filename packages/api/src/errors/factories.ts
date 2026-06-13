import { BadRequestError, ConflictError, InternalError, NotFoundError } from "./classes.ts";

export function createSourceRootPathUnavailableError(
  rootId: string,
  path: string,
  cause?: unknown,
) {
  return new BadRequestError("source root のパスにアクセスできません", { rootId, path }, cause);
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

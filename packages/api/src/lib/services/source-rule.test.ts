import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { ConflictError, NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { sourceRoots } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import { trySyncSourceRootCatalog } from "./catalog-sync.ts";
import {
  createSourceExcludeRule,
  createSourceIncludeRule,
  deleteSourceExcludeRule,
  deleteSourceIncludeRule,
  listSourceExcludeRules,
  listSourceIncludeRules,
  updateSourceExcludeRule,
  updateSourceIncludeRule,
} from "./source-rule.ts";

vi.mock("./catalog-sync.ts", () => ({
  trySyncSourceRootCatalog: vi.fn(),
}));

const SYNC_SUCCESS = {
  status: "success" as const,
  annict: { status: "skipped", reason: "missing_token" } as const,
  thumbnail: { status: "skipped", reason: "missing_token" } as const,
};

describe("source-rule service", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let rootId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(trySyncSourceRootCatalog).mockResolvedValue(SYNC_SUCCESS);
    testDb = await createTestDb();
    db = testDb.db;
    rootId = "source-root";
    await db.insert(sourceRoots).values({
      id: rootId,
      path: "/source-root",
    });
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("include rule を作成できる", async () => {
    const rule = await createSourceIncludeRule(db, {
      rootId,
      pattern: "include-pattern",
      sortOrder: 0,
    });

    expect(rule.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(rule).toEqual({
      id: rule.id,
      rootId,
      pattern: "include-pattern",
      sortOrder: 0,
      sync: SYNC_SUCCESS,
    });
  });

  it("sortOrder 未指定の exclude rule は 0 で作成される", async () => {
    const rule = await createSourceExcludeRule(db, {
      rootId,
      pattern: "exclude-pattern",
    });

    expect(rule.pattern).toBe("exclude-pattern");
    expect(rule.sortOrder).toBe(0);
  });

  it("存在しない rootId での作成は NotFoundError になる", async () => {
    await expect(
      createSourceIncludeRule(db, {
        rootId: "missing",
        pattern: "pattern",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      createSourceExcludeRule(db, {
        rootId: "missing",
        pattern: "pattern",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("sortOrder 未指定の include rule は末尾に追加される", async () => {
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "second",
    });

    const rules = await listSourceIncludeRules(db, rootId);

    expect(rules.map((rule) => rule.sortOrder)).toEqual([0, 1]);
  });

  it("sortOrder 未指定の exclude rule は末尾に追加される", async () => {
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "second",
    });

    const rules = await listSourceExcludeRules(db, rootId);

    expect(rules.map((rule) => rule.sortOrder)).toEqual([0, 1]);
  });

  it("include rule 一覧は sortOrder の昇順で返す", async () => {
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "second",
      sortOrder: 1,
    });
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });

    const rules = await listSourceIncludeRules(db, rootId);

    expect(rules.map((rule) => rule.pattern)).toEqual(["first", "second"]);
  });

  it("exclude rule 一覧は sortOrder の昇順で返す", async () => {
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "second",
      sortOrder: 1,
    });
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });

    const rules = await listSourceExcludeRules(db, rootId);

    expect(rules.map((rule) => rule.pattern)).toEqual(["first", "second"]);
  });

  it("存在しない rootId での一覧取得は NotFoundError になる", async () => {
    await expect(listSourceIncludeRules(db, "missing")).rejects.toBeInstanceOf(NotFoundError);
    await expect(listSourceExcludeRules(db, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("存在しない ruleId の更新は NotFoundError になる", async () => {
    await expect(
      updateSourceIncludeRule(db, "missing", {
        pattern: "updated",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      updateSourceExcludeRule(db, "missing", {
        pattern: "updated",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pattern のみ更新したとき sortOrder は変わらない", async () => {
    const rule = await createSourceIncludeRule(db, {
      rootId,
      pattern: "original",
      sortOrder: 0,
    });

    const updated = await updateSourceIncludeRule(db, rule.id, {
      pattern: "updated",
    });

    expect(updated).toEqual({
      id: rule.id,
      rootId,
      pattern: "updated",
      sortOrder: 0,
      sync: SYNC_SUCCESS,
    });
  });

  it("sortOrder のみ更新したとき pattern は変わらない", async () => {
    const rule = await createSourceIncludeRule(db, {
      rootId,
      pattern: "original",
      sortOrder: 0,
    });

    const updated = await updateSourceIncludeRule(db, rule.id, {
      sortOrder: 1,
    });

    expect(updated).toEqual({
      id: rule.id,
      rootId,
      pattern: "original",
      sortOrder: 1,
      sync: SYNC_SUCCESS,
    });
  });

  it("存在しない ruleId の削除は NotFoundError になる", async () => {
    await expect(deleteSourceIncludeRule(db, "missing")).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteSourceExcludeRule(db, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("include rule を削除できる", async () => {
    const rule = await createSourceIncludeRule(db, {
      rootId,
      pattern: "target",
      sortOrder: 0,
    });

    await deleteSourceIncludeRule(db, rule.id);

    await expect(listSourceIncludeRules(db, rootId)).resolves.toEqual([]);
  });

  it("exclude rule を削除できる", async () => {
    const rule = await createSourceExcludeRule(db, {
      rootId,
      pattern: "target",
      sortOrder: 0,
    });

    await deleteSourceExcludeRule(db, rule.id);

    await expect(listSourceExcludeRules(db, rootId)).resolves.toEqual([]);
  });

  it("同一 root で pattern が重複する include rule の作成は ConflictError になる", async () => {
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "duplicate",
      sortOrder: 0,
    });

    await expect(
      createSourceIncludeRule(db, {
        rootId,
        pattern: "duplicate",
        sortOrder: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("同一 root で sortOrder が重複する include rule の作成は ConflictError になる", async () => {
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });

    await expect(
      createSourceIncludeRule(db, {
        rootId,
        pattern: "second",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("同一 root で sortOrder が重複する exclude rule の作成は ConflictError になる", async () => {
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });

    await expect(
      createSourceExcludeRule(db, {
        rootId,
        pattern: "second",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("他の include rule と pattern が重複する更新は ConflictError になる", async () => {
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "duplicate",
      sortOrder: 0,
    });
    const target = await createSourceIncludeRule(db, {
      rootId,
      pattern: "target",
      sortOrder: 1,
    });

    await expect(
      updateSourceIncludeRule(db, target.id, {
        pattern: "duplicate",
        sortOrder: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("他の include rule と sortOrder が重複する更新は ConflictError になる", async () => {
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });
    const target = await createSourceIncludeRule(db, {
      rootId,
      pattern: "target",
      sortOrder: 1,
    });

    await expect(
      updateSourceIncludeRule(db, target.id, {
        pattern: "target",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("同一 root で pattern が重複する exclude rule の作成は ConflictError になる", async () => {
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "duplicate",
      sortOrder: 0,
    });

    await expect(
      createSourceExcludeRule(db, {
        rootId,
        pattern: "duplicate",
        sortOrder: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("他の exclude rule と pattern が重複する更新は ConflictError になる", async () => {
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "duplicate",
      sortOrder: 0,
    });
    const target = await createSourceExcludeRule(db, {
      rootId,
      pattern: "target",
      sortOrder: 1,
    });

    await expect(
      updateSourceExcludeRule(db, target.id, {
        pattern: "duplicate",
        sortOrder: 1,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("他の exclude rule と sortOrder が重複する更新は ConflictError になる", async () => {
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "first",
      sortOrder: 0,
    });
    const target = await createSourceExcludeRule(db, {
      rootId,
      pattern: "target",
      sortOrder: 1,
    });

    await expect(
      updateSourceExcludeRule(db, target.id, {
        pattern: "target",
        sortOrder: 0,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("include と exclude は同じ pattern でも別 rule として作成できる", async () => {
    const includeRule = await createSourceIncludeRule(db, {
      rootId,
      pattern: "shared-pattern",
      sortOrder: 0,
    });
    const excludeRule = await createSourceExcludeRule(db, {
      rootId,
      pattern: "shared-pattern",
      sortOrder: 0,
    });

    expect(includeRule.pattern).toBe("shared-pattern");
    expect(excludeRule.pattern).toBe("shared-pattern");
    expect(includeRule.id).not.toBe(excludeRule.id);
  });

  it("別 root では同じ pattern と sortOrder を使える", async () => {
    const otherRootId = "other-source-root";
    await db.insert(sourceRoots).values({
      id: otherRootId,
      path: "/other-source-root",
    });

    const first = await createSourceIncludeRule(db, {
      rootId,
      pattern: "shared-pattern",
      sortOrder: 0,
    });
    const second = await createSourceIncludeRule(db, {
      rootId: otherRootId,
      pattern: "shared-pattern",
      sortOrder: 0,
    });

    expect(first.rootId).toBe(rootId);
    expect(second.rootId).toBe(otherRootId);
    expect(first.pattern).toBe(second.pattern);
    expect(first.sortOrder).toBe(second.sortOrder);
  });
});

describe("カタログ同期", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let rootId: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(trySyncSourceRootCatalog).mockResolvedValue(SYNC_SUCCESS);
    testDb = await createTestDb();
    db = testDb.db;
    rootId = "source-root";
    await db.insert(sourceRoots).values({
      id: rootId,
      path: "/source-root",
    });
  });

  afterEach(async () => {
    await testDb?.cleanup();
    testDb = undefined;
  });

  it("include rule 作成後にカタログ同期を行う", async () => {
    await createSourceIncludeRule(db, {
      rootId,
      pattern: "include-pattern",
      sortOrder: 0,
    });

    expect(trySyncSourceRootCatalog).toHaveBeenCalledWith(db, rootId);
  });

  it("カタログ同期が失敗しても include rule 作成結果を返す", async () => {
    vi.mocked(trySyncSourceRootCatalog).mockResolvedValue({
      status: "failed",
      error: "指定されたパスのフォルダは存在しません。",
    });

    const result = await createSourceIncludeRule(db, {
      rootId,
      pattern: "include-pattern",
      sortOrder: 0,
    });

    expect(result).toMatchObject({
      rootId,
      pattern: "include-pattern",
      sortOrder: 0,
      sync: {
        status: "failed",
        error: "指定されたパスのフォルダは存在しません。",
      },
    });
    await expect(listSourceIncludeRules(db, rootId)).resolves.toHaveLength(1);
  });

  it("exclude rule 作成後にカタログ同期を行う", async () => {
    await createSourceExcludeRule(db, {
      rootId,
      pattern: "exclude-pattern",
      sortOrder: 0,
    });

    expect(trySyncSourceRootCatalog).toHaveBeenCalledWith(db, rootId);
  });

  it("include rule 更新後にカタログ同期を行う", async () => {
    const rule = await createSourceIncludeRule(db, {
      rootId,
      pattern: "include-pattern",
      sortOrder: 0,
    });
    vi.clearAllMocks();

    await updateSourceIncludeRule(db, rule.id, { pattern: "updated-pattern" });

    expect(trySyncSourceRootCatalog).toHaveBeenCalledWith(db, rootId);
  });

  it("exclude rule 更新後にカタログ同期を行う", async () => {
    const rule = await createSourceExcludeRule(db, {
      rootId,
      pattern: "exclude-pattern",
      sortOrder: 0,
    });
    vi.clearAllMocks();

    await updateSourceExcludeRule(db, rule.id, { pattern: "updated-pattern" });

    expect(trySyncSourceRootCatalog).toHaveBeenCalledWith(db, rootId);
  });

  it("include rule 削除後にカタログ同期を行う", async () => {
    const rule = await createSourceIncludeRule(db, {
      rootId,
      pattern: "include-pattern",
      sortOrder: 0,
    });
    vi.clearAllMocks();

    await deleteSourceIncludeRule(db, rule.id);

    expect(trySyncSourceRootCatalog).toHaveBeenCalledWith(db, rootId);
  });

  it("exclude rule 削除後にカタログ同期を行う", async () => {
    const rule = await createSourceExcludeRule(db, {
      rootId,
      pattern: "exclude-pattern",
      sortOrder: 0,
    });
    vi.clearAllMocks();

    await deleteSourceExcludeRule(db, rule.id);

    expect(trySyncSourceRootCatalog).toHaveBeenCalledWith(db, rootId);
  });
});

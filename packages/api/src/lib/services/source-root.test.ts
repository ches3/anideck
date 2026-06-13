import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { sourceExcludeRules, sourceIncludeRules } from "../db/schema.ts";
import { createTestDb } from "../db/test-helper.ts";
import {
  createSourceRoot,
  deleteSourceRoot,
  getSourceRoot,
  updateSourceRoot,
} from "./source-root.ts";

describe("source-root service", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  it("作成した source root は ULID 形式の id と指定した path を持つ", async () => {
    const root = await createSourceRoot(db, { path: "/media/anime" });

    expect(root.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(root.path).toBe("/media/anime");
  });

  it("path の更新後も id は変わらない", async () => {
    const root = await createSourceRoot(db, { path: "/media/anime" });

    const updated = await updateSourceRoot(db, root.id, { path: "/media/anime2" });

    expect(updated).toEqual({
      id: root.id,
      path: "/media/anime2",
    });
  });

  it("存在しない id の更新は NotFoundError になる", async () => {
    await expect(updateSourceRoot(db, "missing", { path: "/media/anime" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("存在する id では source root を返す", async () => {
    const root = await createSourceRoot(db, { path: "/media/anime" });

    await expect(getSourceRoot(db, root.id)).resolves.toEqual(root);
  });

  it("存在しない id では null を返す", async () => {
    await expect(getSourceRoot(db, "missing")).resolves.toBeNull();
  });

  it("存在する source root を削除できる", async () => {
    const root = await createSourceRoot(db, { path: "/media/anime" });

    await deleteSourceRoot(db, root.id);

    await expect(getSourceRoot(db, root.id)).resolves.toBeNull();
  });

  it("存在しない id の削除は NotFoundError になる", async () => {
    await expect(deleteSourceRoot(db, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("削除時に紐づく include / exclude rule も削除される", async () => {
    const root = await createSourceRoot(db, { path: "/media/anime" });

    await db.insert(sourceIncludeRules).values({
      id: "INCLUDE01",
      rootId: root.id,
      pattern: "include-pattern",
      sortOrder: 0,
    });
    await db.insert(sourceExcludeRules).values({
      id: "EXCLUDE01",
      rootId: root.id,
      pattern: "exclude-pattern",
      sortOrder: 0,
    });

    await deleteSourceRoot(db, root.id);

    const includeRules = await db
      .select()
      .from(sourceIncludeRules)
      .where(eq(sourceIncludeRules.rootId, root.id));
    const excludeRules = await db
      .select()
      .from(sourceExcludeRules)
      .where(eq(sourceExcludeRules.rootId, root.id));

    expect(includeRules).toEqual([]);
    expect(excludeRules).toEqual([]);
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

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

const fsMockState = vi.hoisted(() => ({
  unreadableDirPath: undefined as string | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    opendir: async (...args: Parameters<typeof actual.opendir>) => {
      const [path] = args;
      if (
        fsMockState.unreadableDirPath !== undefined &&
        String(path) === fsMockState.unreadableDirPath
      ) {
        const error = new Error("directory is not readable") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      return actual.opendir(...args);
    },
  };
});

describe("source-root service", () => {
  let db: Db;
  let tempDir: string;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    tempDir = await mkdtemp(join(tmpdir(), "anideck-source-root-"));
  });

  afterEach(async () => {
    fsMockState.unreadableDirPath = undefined;
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("作成した source root は ULID 形式の id と指定した path を持つ", async () => {
    const root = await createSourceRoot(db, { path: tempDir });

    expect(root.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(root.path).toBe(tempDir);
  });

  it("path の更新後も id は変わらない", async () => {
    const root = await createSourceRoot(db, { path: tempDir });
    const updatedDir = await mkdtemp(join(tmpdir(), "anideck-source-root-updated-"));

    try {
      const updated = await updateSourceRoot(db, root.id, { path: updatedDir });

      expect(updated).toEqual({
        id: root.id,
        path: updatedDir,
      });
    } finally {
      await rm(updatedDir, { recursive: true, force: true });
    }
  });

  it("存在しない id の更新は NotFoundError になる", async () => {
    await expect(updateSourceRoot(db, "missing", { path: tempDir })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("存在しない path では source root を作成できない", async () => {
    const missingPath = join(tempDir, "missing-root");

    await expect(createSourceRoot(db, { path: missingPath })).rejects.toMatchObject({
      message: "指定されたパスは存在しません",
    });
  });

  it("ファイル path では source root を作成できない", async () => {
    const filePath = join(tempDir, "video.mp4");
    await writeFile(filePath, "");

    await expect(createSourceRoot(db, { path: filePath })).rejects.toMatchObject({
      message: "指定されたパスはフォルダではありません",
    });
  });

  it("読み取れない path では source root を作成できない", async () => {
    fsMockState.unreadableDirPath = tempDir;

    await expect(createSourceRoot(db, { path: tempDir })).rejects.toMatchObject({
      message: "指定されたフォルダを読み取れません",
    });
  });

  it("存在しない path では source root を更新できない", async () => {
    const root = await createSourceRoot(db, { path: tempDir });
    const missingPath = join(tempDir, "missing-root");

    await expect(updateSourceRoot(db, root.id, { path: missingPath })).rejects.toMatchObject({
      message: "指定されたパスは存在しません",
    });
  });

  it("読み取れない path では source root を更新できない", async () => {
    const root = await createSourceRoot(db, { path: tempDir });
    const unreadableDir = await mkdtemp(join(tmpdir(), "anideck-source-root-unreadable-"));
    fsMockState.unreadableDirPath = unreadableDir;

    try {
      await expect(updateSourceRoot(db, root.id, { path: unreadableDir })).rejects.toMatchObject({
        message: "指定されたフォルダを読み取れません",
      });
    } finally {
      fsMockState.unreadableDirPath = undefined;
      await rm(unreadableDir, { recursive: true, force: true });
    }
  });

  it("存在する id では source root を返す", async () => {
    const root = await createSourceRoot(db, { path: tempDir });

    await expect(getSourceRoot(db, root.id)).resolves.toEqual(root);
  });

  it("存在しない id では null を返す", async () => {
    await expect(getSourceRoot(db, "missing")).resolves.toBeNull();
  });

  it("存在する source root を削除できる", async () => {
    const root = await createSourceRoot(db, { path: tempDir });

    await deleteSourceRoot(db, root.id);

    await expect(getSourceRoot(db, root.id)).resolves.toBeNull();
  });

  it("存在しない id の削除は NotFoundError になる", async () => {
    await expect(deleteSourceRoot(db, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("削除時に紐づく include / exclude rule も削除される", async () => {
    const root = await createSourceRoot(db, { path: tempDir });

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

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { episodes, sourceExcludeRules, sourceIncludeRules } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import {
  createSourceRoot,
  deleteSourceRoot,
  getSourceRoot,
  updateSourceRoot,
} from "./source-root.ts";
import { createSourceIncludeRule } from "./source-rule.ts";
import { getWork } from "./work.ts";

function regexPathWithNamedGroups(workTitlePattern: string, episodeTitlePattern: string): string {
  const regexSep = sep.replaceAll("\\", "\\\\");
  return `(?<workTitle>${workTitlePattern})${regexSep}(?<episodeTitle>${episodeTitlePattern})\\.mp4`;
}

const fsMockState = vi.hoisted(() => ({
  unreadableDirPath: undefined as string | undefined,
  readdirErrorPath: undefined as string | undefined,
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
    readdir: async (...args: Parameters<typeof actual.readdir>) => {
      const [path] = args;
      if (
        fsMockState.readdirErrorPath !== undefined &&
        String(path) === fsMockState.readdirErrorPath
      ) {
        const error = new Error("directory cannot be listed") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
      return actual.readdir(...args);
    },
  };
});

describe("source-root service", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let tempDir: string;

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    tempDir = await mkdtemp(join(tmpdir(), "anideck-source-root-"));
  });

  afterEach(async () => {
    fsMockState.unreadableDirPath = undefined;
    fsMockState.readdirErrorPath = undefined;
    vi.restoreAllMocks();
    await testDb?.cleanup();
    testDb = undefined;
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
        sync: {
          status: "success",
          annict: { status: "skipped", reason: "missing_token" },
          thumbnail: { status: "skipped", reason: "missing_token" },
        },
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

  it("path 更新後に catalog を同期する", async () => {
    const root = await createSourceRoot(db, { path: tempDir });
    const updatedDir = await mkdtemp(join(tmpdir(), "anideck-source-root-updated-"));

    try {
      await mkdir(join(tempDir, "Series A"), { recursive: true });
      await writeFile(join(tempDir, "Series A", "#01.mp4"), "");

      await createSourceIncludeRule(db, {
        rootId: root.id,
        pattern: regexPathWithNamedGroups("[^\\\\]+", "[^\\\\]+"),
        sortOrder: 0,
      });

      const seriesAWorkId = createWorkId(root.id, "Series A");
      await expect(getWork(db, seriesAWorkId)).resolves.toMatchObject({
        id: seriesAWorkId,
        episodes: [{ title: "#01", path: join(tempDir, "Series A", "#01.mp4") }],
      });

      await mkdir(join(updatedDir, "Series B"), { recursive: true });
      await writeFile(join(updatedDir, "Series B", "#01.mp4"), "");

      const updated = await updateSourceRoot(db, root.id, { path: updatedDir });

      expect(updated).toMatchObject({
        id: root.id,
        path: updatedDir,
        sync: {
          status: "success",
        },
      });

      const seriesAEpisode = await db.query.episodes.findFirst({
        where: eq(episodes.id, createEpisodeId(root.id, join("Series A", "#01.mp4"))),
      });
      const seriesBEpisode = await db.query.episodes.findFirst({
        where: eq(episodes.id, createEpisodeId(root.id, join("Series B", "#01.mp4"))),
      });

      expect(seriesAEpisode?.active).toBe(false);
      expect(seriesBEpisode?.active).toBe(true);

      const seriesBWorkId = createWorkId(root.id, "Series B");
      await expect(getWork(db, seriesBWorkId)).resolves.toMatchObject({
        id: seriesBWorkId,
        episodes: [{ title: "#01", path: join(updatedDir, "Series B", "#01.mp4") }],
      });
      await expect(getWork(db, seriesAWorkId)).rejects.toBeInstanceOf(NotFoundError);
    } finally {
      await rm(updatedDir, { recursive: true, force: true });
    }
  });

  it("path 更新後のデータ同期が失敗した場合は更新結果と同期結果を返す", async () => {
    const root = await createSourceRoot(db, { path: tempDir });
    const updatedDir = await mkdtemp(join(tmpdir(), "anideck-source-root-updated-"));
    const otherDir = await mkdtemp(join(tmpdir(), "anideck-source-root-other-"));

    try {
      await mkdir(join(tempDir, "Series A"), { recursive: true });
      await writeFile(join(tempDir, "Series A", "#01.mp4"), "");

      await createSourceIncludeRule(db, {
        rootId: root.id,
        pattern: regexPathWithNamedGroups("[^\\\\]+", "[^\\\\]+"),
        sortOrder: 0,
      });
      const seriesAWorkId = createWorkId(root.id, "Series A");
      await expect(getWork(db, seriesAWorkId)).resolves.toMatchObject({
        id: seriesAWorkId,
        episodes: [{ title: "#01", path: join(tempDir, "Series A", "#01.mp4") }],
      });

      const otherRoot = await createSourceRoot(db, { path: otherDir });
      await mkdir(join(otherDir, "Series B"), { recursive: true });
      await writeFile(join(otherDir, "Series B", "#01.mp4"), "");
      await createSourceIncludeRule(db, {
        rootId: otherRoot.id,
        pattern: regexPathWithNamedGroups("[^\\\\]+", "[^\\\\]+"),
        sortOrder: 0,
      });
      const seriesBWorkId = createWorkId(otherRoot.id, "Series B");

      fsMockState.readdirErrorPath = updatedDir;

      const updated = await updateSourceRoot(db, root.id, { path: updatedDir });

      expect(updated).toEqual({
        id: root.id,
        path: updatedDir,
        sync: {
          status: "failed",
          error: "指定されたフォルダを読み取れません",
        },
      });
      await expect(getSourceRoot(db, root.id)).resolves.toEqual({
        id: root.id,
        path: updatedDir,
      });

      const seriesAEpisode = await db.query.episodes.findFirst({
        where: eq(episodes.id, createEpisodeId(root.id, join("Series A", "#01.mp4"))),
      });

      expect(seriesAEpisode?.active).toBe(false);
      await expect(getWork(db, seriesAWorkId)).rejects.toBeInstanceOf(NotFoundError);
      await expect(getWork(db, seriesBWorkId)).resolves.toMatchObject({
        id: seriesBWorkId,
        episodes: [{ title: "#01", path: join(otherDir, "Series B", "#01.mp4") }],
      });
    } finally {
      fsMockState.readdirErrorPath = undefined;
      await rm(updatedDir, { recursive: true, force: true });
      await rm(otherDir, { recursive: true, force: true });
    }
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

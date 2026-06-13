import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type * as FsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { BadRequestError, NotFoundError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { createTestDb } from "../db/test-helper.ts";
import { listSourceFiles } from "./source-file.ts";
import { createSourceRoot } from "./source-root.ts";
import { createSourceExcludeRule, createSourceIncludeRule } from "./source-rule.ts";

const fsMockState = vi.hoisted(() => ({
  unreadableDirPath: undefined as string | undefined,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    readdir: async (
      path: Parameters<typeof actual.readdir>[0],
      options: { withFileTypes: true },
    ) => {
      if (
        fsMockState.unreadableDirPath !== undefined &&
        String(path) === fsMockState.unreadableDirPath
      ) {
        const error = new Error("directory vanished") as NodeJS.ErrnoException;
        error.code = "ENOENT";
        throw error;
      }
      return actual.readdir(path, options);
    },
  };
});

function regexPath(directory: string, filePattern: string): string {
  const regexSep = sep.replaceAll("\\", "\\\\");
  return join(directory) + regexSep + filePattern;
}

describe("source-file service", () => {
  let db: Db;
  let rootId: string;
  let tempDir: string;

  beforeEach(async () => {
    ({ db } = await createTestDb());
    tempDir = await mkdtemp(join(tmpdir(), "anideck-source-file-"));

    const root = await createSourceRoot(db, { path: tempDir });
    rootId = root.id;
  });

  afterEach(async () => {
    fsMockState.unreadableDirPath = undefined;
    vi.restoreAllMocks();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("ネストしたファイルを走査して include rule にマッチするものだけ返す", async () => {
    await mkdir(join(tempDir, "Series"), { recursive: true });
    await writeFile(join(tempDir, "Series", "#01.mp4"), "");
    await writeFile(join(tempDir, "Series", "readme.txt"), "");
    await writeFile(join(tempDir, "other.mp4"), "");

    await createSourceIncludeRule(db, {
      rootId,
      pattern: regexPath("Series", ".*\\.mp4"),
      sortOrder: 0,
    });

    const files = await listSourceFiles(db, rootId);

    expect(files).toEqual([{ relativePath: join("Series", "#01.mp4") }]);
  });

  it("exclude rule にマッチするファイルは除外する", async () => {
    await mkdir(join(tempDir, "Series"), { recursive: true });
    await writeFile(join(tempDir, "Series", "#01.mp4"), "");
    await writeFile(join(tempDir, "Series", "special.mp4"), "");

    await createSourceIncludeRule(db, {
      rootId,
      pattern: regexPath("Series", ".*\\.mp4"),
      sortOrder: 0,
    });
    await createSourceExcludeRule(db, {
      rootId,
      pattern: regexPath("Series", "special\\.mp4"),
      sortOrder: 0,
    });

    const files = await listSourceFiles(db, rootId);

    expect(files).toEqual([{ relativePath: join("Series", "#01.mp4") }]);
  });

  it("走査中に読めない配下ディレクトリはスキップして読めるファイルを返す", async () => {
    const readableDir = join(tempDir, "Readable");
    const vanishedDir = join(tempDir, "Vanished");
    await mkdir(readableDir, { recursive: true });
    await mkdir(vanishedDir, { recursive: true });
    await writeFile(join(readableDir, "#01.mp4"), "");
    await writeFile(join(vanishedDir, "#02.mp4"), "");

    await createSourceIncludeRule(db, {
      rootId,
      pattern: ".*\\.mp4",
      sortOrder: 0,
    });

    fsMockState.unreadableDirPath = vanishedDir;

    const files = await listSourceFiles(db, rootId);

    expect(files).toEqual([{ relativePath: join("Readable", "#01.mp4") }]);
  });

  it("include rule がない root は空配列を返す", async () => {
    await writeFile(join(tempDir, "video.mp4"), "");

    const files = await listSourceFiles(db, rootId);

    expect(files).toEqual([]);
  });

  it("存在しない root は NotFoundError になる", async () => {
    await expect(listSourceFiles(db, "missing")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("存在しない root path は BadRequestError になる", async () => {
    const missingPath = join(tempDir, "missing-root");
    const root = await createSourceRoot(db, { path: missingPath });

    await expect(listSourceFiles(db, root.id)).rejects.toBeInstanceOf(BadRequestError);
  });
});

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { classifySourceRootPathFailure, fileExists } from "./fs.ts";

let tempDir = "";

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "anideck-fs-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("fileExists", () => {
  it("ファイルが存在する場合は true を返す", async () => {
    const filePath = join(tempDir, "exists.txt");
    await writeFile(filePath, "test");

    await expect(fileExists(filePath)).resolves.toBe(true);
  });

  it("ファイルが存在しない場合は false を返す", async () => {
    await expect(fileExists(join(tempDir, "missing.txt"))).resolves.toBe(false);
  });
});

describe("classifySourceRootPathFailure", () => {
  it("ENOENT は not_found になる", () => {
    const error = new Error("no such file") as NodeJS.ErrnoException;
    error.code = "ENOENT";

    expect(classifySourceRootPathFailure(error)).toBe("not_found");
  });

  it("ENOTDIR は not_directory になる", () => {
    const error = new Error("not a directory") as NodeJS.ErrnoException;
    error.code = "ENOTDIR";

    expect(classifySourceRootPathFailure(error)).toBe("not_directory");
  });

  it("EACCES は unreadable になる", () => {
    const error = new Error("permission denied") as NodeJS.ErrnoException;
    error.code = "EACCES";

    expect(classifySourceRootPathFailure(error)).toBe("unreadable");
  });

  it("code がない Error は unreadable になる", () => {
    expect(classifySourceRootPathFailure(new Error("unknown"))).toBe("unreadable");
  });
});

import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { findRepoRoot, resolveDataDir, resolveDbPath } from "./path.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("findRepoRoot", () => {
  it("API ソース配下からリポジトリルートを返す", () => {
    const apiSourceDir = dirname(fileURLToPath(import.meta.url));

    expect(findRepoRoot(apiSourceDir)).toBe(repoRoot);
  });

  it("ビルド済みサーバー配下からリポジトリルートを返す", () => {
    const builtServerAssetsDir = join(repoRoot, "packages", "web", "build", "server", "assets");

    expect(findRepoRoot(builtServerAssetsDir)).toBe(repoRoot);
  });
});

describe("resolveDataDir", () => {
  it("ANIDECK_DATA_DIR が指定されている場合はそのパスを返す", () => {
    vi.stubEnv("ANIDECK_DATA_DIR", "custom/data");

    expect(resolveDataDir()).toBe(resolve("custom/data"));
  });

  it("development ではリポジトリルート配下の .data を返す", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDataDir()).toBe(join(repoRoot, ".data"));
  });

  it("production で LOCALAPPDATA が指定されている場合はその配下の anideck ディレクトリを返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\user\\AppData\\Local");

    expect(resolveDataDir()).toBe(join("C:\\Users\\user\\AppData\\Local", "anideck"));
  });

  it("production で LOCALAPPDATA が未指定の場合は XDG_DATA_HOME 配下の anideck ディレクトリを返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCALAPPDATA", "");
    vi.stubEnv("XDG_DATA_HOME", "/tmp/data");

    expect(resolveDataDir()).toBe(join("/tmp/data", "anideck"));
  });

  it("production で LOCALAPPDATA と XDG_DATA_HOME が未指定の場合は ~/.local/share/anideck を返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCALAPPDATA", "");
    vi.stubEnv("XDG_DATA_HOME", "");

    expect(resolveDataDir()).toBe(join(homedir(), ".local", "share", "anideck"));
  });
});

describe("resolveDbPath", () => {
  it("data ディレクトリ配下の anideck.sqlite を返す", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveDbPath()).toBe(join(repoRoot, ".data", "anideck.sqlite"));
  });

  it("ANIDECK_DATA_DIR が指定されている場合はその配下の anideck.sqlite を返す", () => {
    vi.stubEnv("ANIDECK_DATA_DIR", "custom/data");

    expect(resolveDbPath()).toBe(join(resolve("custom/data"), "anideck.sqlite"));
  });
});

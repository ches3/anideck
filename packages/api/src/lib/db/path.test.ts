import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { resolveAnideckDbPath } from "./path.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveAnideckDbPath", () => {
  it("ANIDECK_DB_PATH が指定されている場合はそのパスを返す", () => {
    vi.stubEnv("ANIDECK_DB_PATH", "custom/anideck.sqlite");

    expect(resolveAnideckDbPath()).toBe(resolve("custom/anideck.sqlite"));
  });

  it("development ではリポジトリルート配下の .data のパスを返す", () => {
    vi.stubEnv("NODE_ENV", "development");

    expect(resolveAnideckDbPath()).toBe(join(repoRoot, ".data", "anideck.sqlite"));
  });

  it("production で LOCALAPPDATA が指定されている場合はその配下のパスを返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCALAPPDATA", "C:\\Users\\user\\AppData\\Local");

    expect(resolveAnideckDbPath()).toBe(
      join("C:\\Users\\user\\AppData\\Local", "anideck", "anideck.sqlite"),
    );
  });

  it("production で LOCALAPPDATA が未指定の場合は XDG_DATA_HOME 配下のパスを返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCALAPPDATA", "");
    vi.stubEnv("XDG_DATA_HOME", "/tmp/data");

    expect(resolveAnideckDbPath()).toBe(join("/tmp/data", "anideck", "anideck.sqlite"));
  });

  it("production で LOCALAPPDATA と XDG_DATA_HOME が未指定の場合は ~/.local/share 配下のパスを返す", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOCALAPPDATA", "");
    vi.stubEnv("XDG_DATA_HOME", "");

    expect(resolveAnideckDbPath()).toBe(
      join(homedir(), ".local", "share", "anideck", "anideck.sqlite"),
    );
  });
});

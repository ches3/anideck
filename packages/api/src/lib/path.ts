import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const fallbackRepoRoot = resolve(moduleDir, "../../../..");

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

export function findRepoRoot(startDir: string): string {
  let currentDir = resolve(startDir);
  const root = parse(currentDir).root;

  while (currentDir !== root) {
    if (existsSync(join(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }

    currentDir = dirname(currentDir);
  }

  if (existsSync(join(root, "pnpm-workspace.yaml"))) {
    return root;
  }

  return fallbackRepoRoot;
}

function resolveDevDataDir(): string {
  return join(findRepoRoot(moduleDir), ".data");
}

function resolveProdDataDir(): string {
  if (hasValue(process.env.LOCALAPPDATA)) {
    return join(process.env.LOCALAPPDATA, "anideck");
  }

  if (hasValue(process.env.XDG_DATA_HOME)) {
    return join(process.env.XDG_DATA_HOME, "anideck");
  }

  return join(homedir(), ".local", "share", "anideck");
}

export function resolveDataDir(): string {
  if (hasValue(process.env.ANIDECK_DATA_DIR)) {
    return resolve(process.env.ANIDECK_DATA_DIR);
  }

  if (process.env.NODE_ENV === "production") {
    return resolveProdDataDir();
  }

  return resolveDevDataDir();
}

export function resolveDbPath(): string {
  return join(resolveDataDir(), "anideck.sqlite");
}

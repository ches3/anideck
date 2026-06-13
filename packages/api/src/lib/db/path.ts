import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

function hasValue(value: string | undefined): value is string {
  return value !== undefined && value !== "";
}

function resolveDevDbPath(): string {
  return join(repoRoot, ".data", "anideck.sqlite");
}

function resolveProdDbPath(): string {
  if (hasValue(process.env.LOCALAPPDATA)) {
    return join(process.env.LOCALAPPDATA, "anideck", "anideck.sqlite");
  }

  if (hasValue(process.env.XDG_DATA_HOME)) {
    return join(process.env.XDG_DATA_HOME, "anideck", "anideck.sqlite");
  }

  return join(homedir(), ".local", "share", "anideck", "anideck.sqlite");
}

export function resolveAnideckDbPath(): string {
  if (hasValue(process.env.ANIDECK_DB_PATH)) {
    return resolve(process.env.ANIDECK_DB_PATH);
  }

  if (process.env.NODE_ENV === "production") {
    return resolveProdDbPath();
  }

  return resolveDevDbPath();
}

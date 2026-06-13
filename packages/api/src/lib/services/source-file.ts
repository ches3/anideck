import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import { join, relative } from "node:path";

import {
  AppError,
  createSourceRootNotFoundError,
  createSourceRootPathUnavailableError,
} from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { getSourceRoot } from "./source-root.ts";
import { listSourceExcludeRules, listSourceIncludeRules } from "./source-rule.ts";

export interface SourceFileRecord {
  relativePath: string;
}

function toApiRelativePath(rootPath: string, filePath: string): string {
  return relative(rootPath, filePath);
}

function matchesAnyPattern(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern).test(relativePath));
}

async function assertSourceRootPathAvailable(rootId: string, rootPath: string): Promise<void> {
  try {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) {
      throw createSourceRootPathUnavailableError(rootId, rootPath);
    }
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw createSourceRootPathUnavailableError(rootId, rootPath, error);
  }
}

async function readDirectoryEntries(dirPath: string, skipOnError: boolean): Promise<Dirent[]> {
  try {
    return await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if (skipOnError) {
      return [];
    }
    throw error;
  }
}

async function walkFiles(dirPath: string, skipReadError: boolean): Promise<string[]> {
  const entries = await readDirectoryEntries(dirPath, skipReadError);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath, true)));
      continue;
    }
    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function listSourceFiles(db: Db, rootId: string): Promise<SourceFileRecord[]> {
  const root = await getSourceRoot(db, rootId);
  if (root === null) {
    throw createSourceRootNotFoundError(rootId);
  }

  await assertSourceRootPathAvailable(rootId, root.path);

  const includeRules = await listSourceIncludeRules(db, rootId);
  if (includeRules.length === 0) {
    return [];
  }

  const excludeRules = await listSourceExcludeRules(db, rootId);
  const includePatterns = includeRules.map((rule) => rule.pattern);
  const excludePatterns = excludeRules.map((rule) => rule.pattern);

  let filePaths: string[];
  try {
    filePaths = await walkFiles(root.path, false);
  } catch (error) {
    throw createSourceRootPathUnavailableError(rootId, root.path, error);
  }

  return filePaths
    .map((filePath) => toApiRelativePath(root.path, filePath))
    .filter(
      (relativePath) =>
        matchesAnyPattern(relativePath, includePatterns) &&
        !matchesAnyPattern(relativePath, excludePatterns),
    )
    .sort((a, b) => a.localeCompare(b))
    .map((relativePath) => ({ relativePath }));
}

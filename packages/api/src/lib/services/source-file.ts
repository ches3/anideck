import type { Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import { join, relative } from "node:path";

import { createSourceRootNotFoundError, createSourceRootPathError } from "../../errors/index.ts";
import type { Db } from "../db/index.ts";
import { classifySourceRootPathFailure } from "../fs-error.ts";
import { assertSourceRootPathAvailable, getSourceRoot } from "./source-root.ts";
import { listSourceExcludeRules, listSourceIncludeRules } from "./source-rule.ts";
import type { SourceRuleRecord } from "./source-rule.ts";

export interface SourceFileTitle {
  work: string;
  episode: string;
}

export interface SourceFileRecord {
  relativePath: string;
  title: SourceFileTitle | null;
}

function toApiRelativePath(rootPath: string, filePath: string): string {
  return relative(rootPath, filePath);
}

function resolveTitle(
  groups: Record<string, string | undefined> | undefined,
): SourceFileTitle | null {
  const work = groups?.workTitle;
  const episode = groups?.episodeTitle;
  if (work === undefined || episode === undefined) {
    return null;
  }
  return { work, episode };
}

function findFirstIncludeMatch(
  relativePath: string,
  includeRules: SourceRuleRecord[],
): { matched: boolean; title: SourceFileTitle | null } {
  for (const rule of includeRules) {
    const match = new RegExp(rule.pattern).exec(relativePath);
    if (match !== null) {
      return { matched: true, title: resolveTitle(match.groups) };
    }
  }
  return { matched: false, title: null };
}

function matchesAnyPattern(relativePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => new RegExp(pattern).test(relativePath));
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

  await assertSourceRootPathAvailable(root.path);

  const includeRules = await listSourceIncludeRules(db, rootId);
  if (includeRules.length === 0) {
    return [];
  }

  const excludeRules = await listSourceExcludeRules(db, rootId);
  const excludePatterns = excludeRules.map((rule) => rule.pattern);

  let filePaths: string[];
  try {
    filePaths = await walkFiles(root.path, false);
  } catch (error) {
    throw createSourceRootPathError(classifySourceRootPathFailure(error), root.path, error);
  }

  return filePaths
    .map((filePath) => toApiRelativePath(root.path, filePath))
    .map((relativePath) => {
      const includeMatch = findFirstIncludeMatch(relativePath, includeRules);
      return { relativePath, includeMatch };
    })
    .filter(
      ({ relativePath, includeMatch }) =>
        includeMatch.matched && !matchesAnyPattern(relativePath, excludePatterns),
    )
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map(({ relativePath, includeMatch }) => ({
      relativePath,
      title: includeMatch.title,
    }));
}

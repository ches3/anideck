import { access } from "node:fs/promises";

export type ClassifiedSourceRootPathFailure = "not_found" | "not_directory" | "unreadable";

interface NodeErrnoException extends Error {
  code?: string;
}

function isNodeErrnoException(error: unknown): error is NodeErrnoException {
  return error instanceof Error && "code" in error;
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export function classifySourceRootPathFailure(error: unknown): ClassifiedSourceRootPathFailure {
  if (!isNodeErrnoException(error)) {
    return "unreadable";
  }

  if (error.code === "ENOENT") {
    return "not_found";
  }

  if (error.code === "ENOTDIR") {
    return "not_directory";
  }

  return "unreadable";
}

export type ClassifiedSourceRootPathFailure = "not_found" | "not_directory" | "unreadable";

interface NodeErrnoException extends Error {
  code?: string;
}

function isNodeErrnoException(error: unknown): error is NodeErrnoException {
  return error instanceof Error && "code" in error;
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

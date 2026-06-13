interface SqliteErrorInfo {
  code?: string;
  message: string;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "";
}

function* sqliteErrorChain(error: unknown): Generator<SqliteErrorInfo> {
  let current: unknown = error;

  while (current !== undefined && current !== null) {
    yield {
      code: getErrorCode(current),
      message: getErrorMessage(current),
    };

    current = current instanceof Error ? current.cause : undefined;
  }
}

function includesAll(message: string, fragments: readonly string[]): boolean {
  return fragments.every((fragment) => message.includes(fragment));
}

export function isSqliteUniqueConstraintError(
  error: unknown,
  messageFragments: readonly string[],
): boolean {
  for (const info of sqliteErrorChain(error)) {
    const isUniqueCode =
      info.code === "SQLITE_CONSTRAINT_UNIQUE" || info.code === "SQLITE_CONSTRAINT";
    const isUniqueMessage = info.message.includes("UNIQUE constraint failed");

    if (isUniqueCode && isUniqueMessage && includesAll(info.message, messageFragments)) {
      return true;
    }
  }

  return false;
}

export function isSqliteForeignKeyConstraintError(error: unknown): boolean {
  for (const info of sqliteErrorChain(error)) {
    const isForeignKeyCode =
      info.code === "SQLITE_CONSTRAINT_FOREIGNKEY" || info.code === "SQLITE_CONSTRAINT";
    const isForeignKeyMessage = info.message.includes("FOREIGN KEY constraint failed");

    if (isForeignKeyCode && isForeignKeyMessage) {
      return true;
    }
  }

  return false;
}

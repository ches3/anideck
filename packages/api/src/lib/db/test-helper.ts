import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import type { Db } from "./index.ts";
import * as schema from "./schema.ts";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle");

function isBusyError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code === "EBUSY"
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeTempDir(tempDir: string): Promise<void> {
  const retryDelays = [10, 50, 100, 200];

  for (const delayMs of retryDelays) {
    try {
      await rm(tempDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isBusyError(error)) {
        throw error;
      }

      await sleep(delayMs);
    }
  }

  try {
    await rm(tempDir, { recursive: true, force: true });
  } catch (error) {
    if (!isBusyError(error)) {
      throw error;
    }
  }
}

export interface TestDb {
  db: Db;
  client: ReturnType<typeof createClient>;
  cleanup: () => Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const tempDir = await mkdtemp(join(tmpdir(), "anideck-test-db-"));
  const client = createClient({ url: `file:${join(tempDir, "test.db")}` });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });

  return {
    db,
    client,
    cleanup: async () => {
      client.close();
      await sleep(10);
      await removeTempDir(tempDir);
    },
  };
}

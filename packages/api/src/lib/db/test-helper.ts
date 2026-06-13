import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import type { Db } from "./index.ts";
import * as schema from "./schema.ts";

const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "../../../drizzle");

export async function createTestDb(): Promise<{
  db: Db;
  client: ReturnType<typeof createClient>;
}> {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });

  return { db, client };
}

import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { resolveAnideckDbPath } from "./path.ts";
import * as schema from "./schema.ts";

function createDb(dbPath: string = resolveAnideckDbPath()) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const client = createClient({
    url: `file:${dbPath}`,
  });

  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;

export const db = createDb();

export * from "./schema.ts";

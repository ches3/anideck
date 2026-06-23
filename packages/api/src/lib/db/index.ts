import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { resolveDbPath } from "../path.ts";
import * as schema from "./schema.ts";

function createDb(dbPath: string = resolveDbPath()) {
  mkdirSync(dirname(dbPath), { recursive: true });

  const client = createClient({
    url: `file:${dbPath}`,
  });

  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof createDb>;
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTransaction = Db | DbTransaction;

export const db = createDb();

export * from "./schema.ts";

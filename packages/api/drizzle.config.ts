import { defineConfig } from "drizzle-kit";

import { resolveAnideckDbPath } from "./src/lib/db/path.ts";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${resolveAnideckDbPath()}`,
  },
});

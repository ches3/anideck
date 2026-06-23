import { defineConfig } from "drizzle-kit";

import { resolveDbPath } from "./src/lib/path.ts";

export default defineConfig({
  out: "./drizzle",
  schema: "./src/lib/db/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: `file:${resolveDbPath()}`,
  },
});

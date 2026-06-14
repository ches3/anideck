import { Hono } from "hono";

import type { ApiEnv } from "../lib/context.ts";
import { db } from "../lib/db/index.ts";
import { getWork, listWorks } from "../lib/services/work.ts";

export const worksRoute = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const works = await listWorks(db);
    return c.json({ works }, 200);
  })
  .get("/:workId", async (c) => {
    const workId = c.req.param("workId");
    const work = await getWork(db, workId);
    return c.json({ work }, 200);
  });

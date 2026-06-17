import { Hono } from "hono";

import type { ApiEnv } from "../lib/context.ts";
import { db } from "../lib/db/index.ts";
import { syncAllSourceRootCatalogs } from "../lib/services/catalog-sync.ts";
import { listSourceFiles } from "../lib/services/source-file.ts";
import {
  createSourceRoot,
  deleteSourceRoot,
  listSourceRoots,
  updateSourceRoot,
} from "../lib/services/source-root.ts";
import {
  createSourceExcludeRule,
  createSourceIncludeRule,
  listSourceExcludeRules,
  listSourceIncludeRules,
} from "../lib/services/source-rule.ts";
import { sourceRootCreateSchema, sourceRootUpdateSchema } from "../lib/validation/source-root.ts";
import { sourceRuleCreateSchema } from "../lib/validation/source-rule.ts";
import { vValidator } from "../middleware/validator.ts";

export const sourceRootsRoute = new Hono<ApiEnv>()
  .get("/", async (c) => {
    const sourceRoots = await listSourceRoots(db);
    return c.json({ sourceRoots }, 200);
  })
  .post("/", vValidator("json", sourceRootCreateSchema), async (c) => {
    const body = c.req.valid("json");
    const sourceRoot = await createSourceRoot(db, body);
    return c.json({ sourceRoot }, 201);
  })
  .post("/sync", async (c) => {
    const result = await syncAllSourceRootCatalogs(db);
    return c.json(result, 200);
  })
  .patch("/:rootId", vValidator("json", sourceRootUpdateSchema), async (c) => {
    const rootId = c.req.param("rootId");
    const body = c.req.valid("json");
    const sourceRoot = await updateSourceRoot(db, rootId, body);
    const { sync, ...root } = sourceRoot;
    return c.json({ sourceRoot: root, sync }, 200);
  })
  .delete("/:rootId", async (c) => {
    const rootId = c.req.param("rootId");
    await deleteSourceRoot(db, rootId);
    return c.body(null, 204);
  })
  .get("/:rootId/include-rules", async (c) => {
    const rootId = c.req.param("rootId");
    const includeRules = await listSourceIncludeRules(db, rootId);
    return c.json({ includeRules }, 200);
  })
  .post("/:rootId/include-rules", vValidator("json", sourceRuleCreateSchema), async (c) => {
    const rootId = c.req.param("rootId");
    const body = c.req.valid("json");
    const includeRule = await createSourceIncludeRule(db, {
      rootId,
      pattern: body.pattern,
      sortOrder: body.sortOrder,
    });
    const { sync, ...rule } = includeRule;
    return c.json({ includeRule: rule, sync }, 201);
  })
  .get("/:rootId/exclude-rules", async (c) => {
    const rootId = c.req.param("rootId");
    const excludeRules = await listSourceExcludeRules(db, rootId);
    return c.json({ excludeRules }, 200);
  })
  .post("/:rootId/exclude-rules", vValidator("json", sourceRuleCreateSchema), async (c) => {
    const rootId = c.req.param("rootId");
    const body = c.req.valid("json");
    const excludeRule = await createSourceExcludeRule(db, {
      rootId,
      pattern: body.pattern,
      sortOrder: body.sortOrder,
    });
    const { sync, ...rule } = excludeRule;
    return c.json({ excludeRule: rule, sync }, 201);
  })
  .get("/:rootId/files", async (c) => {
    const rootId = c.req.param("rootId");
    const files = await listSourceFiles(db, rootId);
    return c.json({ files }, 200);
  });

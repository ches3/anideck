import { Hono } from "hono";

import type { ApiEnv } from "../lib/context.ts";
import { db } from "../lib/db/index.ts";
import { deleteSourceIncludeRule, updateSourceIncludeRule } from "../lib/services/source-rule.ts";
import { triggerSourceSync } from "../lib/services/sync/orchestrator.ts";
import { sourceRuleUpdateSchema } from "../lib/validation/source-rule.ts";
import { vValidator } from "../middleware/validator.ts";

export const sourceIncludeRulesRoute = new Hono<ApiEnv>()
  .patch("/:ruleId", vValidator("json", sourceRuleUpdateSchema), async (c) => {
    const ruleId = c.req.param("ruleId");
    const body = c.req.valid("json");
    const includeRule = await updateSourceIncludeRule(db, ruleId, body);
    void triggerSourceSync(db, includeRule.rootId);
    return c.json({ includeRule }, 200);
  })
  .delete("/:ruleId", async (c) => {
    const ruleId = c.req.param("ruleId");
    const rootId = await deleteSourceIncludeRule(db, ruleId);
    void triggerSourceSync(db, rootId);
    return c.body(null, 204);
  });

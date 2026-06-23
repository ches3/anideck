import { Hono } from "hono";

import type { ApiEnv } from "../lib/context.ts";
import { db } from "../lib/db/index.ts";
import { deleteSourceExcludeRule, updateSourceExcludeRule } from "../lib/services/source-rule.ts";
import { triggerSourceSync } from "../lib/services/sync/orchestrator.ts";
import { sourceRuleUpdateSchema } from "../lib/validation/source-rule.ts";
import { vValidator } from "../middleware/validator.ts";

export const sourceExcludeRulesRoute = new Hono<ApiEnv>()
  .patch("/:ruleId", vValidator("json", sourceRuleUpdateSchema), async (c) => {
    const ruleId = c.req.param("ruleId");
    const body = c.req.valid("json");
    const excludeRule = await updateSourceExcludeRule(db, ruleId, body);
    void triggerSourceSync(db, excludeRule.rootId);
    return c.json({ excludeRule }, 200);
  })
  .delete("/:ruleId", async (c) => {
    const ruleId = c.req.param("ruleId");
    const rootId = await deleteSourceExcludeRule(db, ruleId);
    void triggerSourceSync(db, rootId);
    return c.body(null, 204);
  });

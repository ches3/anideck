import { Hono } from "hono";

import type { ApiEnv } from "../lib/context.ts";
import { db } from "../lib/db/index.ts";
import { deleteSourceIncludeRule, updateSourceIncludeRule } from "../lib/services/source-rule.ts";
import { sourceRuleUpdateSchema } from "../lib/validation/source-rule.ts";
import { vValidator } from "../middleware/validator.ts";

export const sourceIncludeRulesRoute = new Hono<ApiEnv>()
  .patch("/:ruleId", vValidator("json", sourceRuleUpdateSchema), async (c) => {
    const ruleId = c.req.param("ruleId");
    const body = c.req.valid("json");
    const includeRule = await updateSourceIncludeRule(db, ruleId, body);
    const { sync, ...rule } = includeRule;
    return c.json({ includeRule: rule, sync }, 200);
  })
  .delete("/:ruleId", async (c) => {
    const ruleId = c.req.param("ruleId");
    const result = await deleteSourceIncludeRule(db, ruleId);
    return c.json(result, 200);
  });

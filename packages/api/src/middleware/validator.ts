import { vValidator as honoVValidator } from "@hono/valibot-validator";
import type { GenericSchema, GenericSchemaAsync } from "valibot";

export function vValidator<
  T extends GenericSchema | GenericSchemaAsync,
  Target extends "json" | "form" | "query" | "param" | "header" | "cookie",
>(target: Target, schema: T) {
  return honoVValidator(target, schema, (result, c) => {
    if (!result.success) {
      const message = result.issues[0].message;
      return c.json({ error: message }, 400);
    }
  });
}

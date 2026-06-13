import type { Context } from "hono";

import type { AppError } from "../errors/index.ts";

export function toErrorResponse(c: Context, error: AppError) {
  const status =
    error.statusCode === 400 || error.statusCode === 404 || error.statusCode === 409
      ? error.statusCode
      : 500;

  c.set("errorMeta", {
    type: "api.app_error",
    errorCode: error.errorCode,
    message: error.message,
    details: error.details ?? null,
  });

  return c.json({ error: error.message }, status);
}

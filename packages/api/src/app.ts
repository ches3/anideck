import { Hono } from "hono";

import { AppError } from "./errors/index.ts";
import type { ApiEnv } from "./lib/context.ts";
import { toErrorResponse } from "./lib/error-response.ts";
import { sourceExcludeRulesRoute } from "./routes/source-exclude-rules.ts";
import { sourceIncludeRulesRoute } from "./routes/source-include-rules.ts";
import { sourceRootsRoute } from "./routes/source-roots.ts";

const apiApp = new Hono<ApiEnv>()
  .use("*", async (c, next) => {
    await next();

    const status = c.res.status;
    if (status < 400) return;

    const appErrorMeta = c.get("errorMeta");
    const basePayload = { method: c.req.method, path: c.req.path, status };
    const logPayload = appErrorMeta
      ? { ...basePayload, ...appErrorMeta }
      : { ...basePayload, type: "api.error_response" };

    if (status >= 500) {
      console.error("API error response", logPayload);
      return;
    }

    console.warn("API error response", logPayload);
  })
  .onError((error, c) => {
    if (error instanceof AppError) {
      return toErrorResponse(c, error);
    }

    const unexpectedErrorMeta =
      error instanceof Error
        ? {
            type: "api.unexpected_error" as const,
            errorName: error.name,
            errorMessage: error.message,
          }
        : {
            type: "api.unexpected_error" as const,
            errorName: "NonErrorThrowable",
            errorMessage: String(error),
          };
    c.set("errorMeta", unexpectedErrorMeta);

    return c.json({ error: "システムエラーが発生しました" }, 500);
  })
  .route("/source-roots", sourceRootsRoute)
  .route("/source-include-rules", sourceIncludeRulesRoute)
  .route("/source-exclude-rules", sourceExcludeRulesRoute);

export type ApiAppType = typeof apiApp;
export { apiApp };

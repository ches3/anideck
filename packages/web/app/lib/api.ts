import type { ApiAppType } from "@anideck/api/api";
import { hc } from "hono/client";

export const apiClient = hc<ApiAppType>("/api");

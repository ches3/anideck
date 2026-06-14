import { apiApp, type ApiAppType } from "@anideck/api/api";
import { hc } from "hono/client";

export function createApiClient(request: Request) {
  const baseUrl = new URL("/", request.url).toString();
  const apiFetch: typeof fetch = async (input, init) => apiApp.request(input, init);

  return hc<ApiAppType>(baseUrl, {
    fetch: apiFetch,
  });
}

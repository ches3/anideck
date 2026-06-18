import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { requestGraphQL } from "./graphql.ts";

const ENDPOINT = "https://example.com/graphql";
const QUERY = "query { test }";
const VARIABLES = { id: 1 };

function parseTestResult(data: unknown): { value: string } {
  if (typeof data === "object" && data !== null && "value" in data) {
    const value = (data as { value: unknown }).value;
    if (typeof value === "string") {
      return { value };
    }
  }
  throw new Error("invalid data");
}

function createSuccessResponse(data: unknown): Response {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createRateLimitResponse(retryAfter?: string): Response {
  const headers: Record<string, string> = {};
  if (retryAfter !== undefined) {
    headers["Retry-After"] = retryAfter;
  }

  return new Response(null, {
    status: 429,
    headers,
  });
}

function createErrorResponse(status: number): Response {
  return new Response(null, { status });
}

describe("requestGraphQL", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("200 成功時は 1 回 fetch して結果を返す", async () => {
    vi.mocked(fetch).mockResolvedValue(createSuccessResponse({ value: "ok" }));

    await expect(requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult)).resolves.toEqual({
      value: "ok",
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ query: QUERY, variables: VARIABLES }),
    });
  });

  it("429 かつ Retry-After が 5 秒の場合は待機後にリトライして成功する", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(createRateLimitResponse("5"))
      .mockResolvedValueOnce(createSuccessResponse({ value: "retried" }));

    const resultPromise = requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult);

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(resultPromise).resolves.toEqual({ value: "retried" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("429 かつ Retry-After が 30 秒の場合はリトライする", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(createRateLimitResponse("30"))
      .mockResolvedValueOnce(createSuccessResponse({ value: "boundary" }));

    const resultPromise = requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(resultPromise).resolves.toEqual({ value: "boundary" });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("429 かつ Retry-After が 31 秒の場合は即 throw する", async () => {
    vi.mocked(fetch).mockResolvedValue(createRateLimitResponse("31"));

    await expect(requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult)).rejects.toThrow(
      "GraphQL request failed: 429",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("429 かつ Retry-After ヘッダがない場合は即 throw する", async () => {
    vi.mocked(fetch).mockResolvedValue(createRateLimitResponse());

    await expect(requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult)).rejects.toThrow(
      "GraphQL request failed: 429",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("429 が連続しても Retry-After が 30 秒以内なら待機してリトライする", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch)
      .mockResolvedValueOnce(createRateLimitResponse("2"))
      .mockResolvedValueOnce(createRateLimitResponse("1"))
      .mockResolvedValueOnce(createSuccessResponse({ value: "ok" }));

    const resultPromise = requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult);
    await vi.advanceTimersByTimeAsync(3000);

    await expect(resultPromise).resolves.toEqual({ value: "ok" });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("429 が 3 リトライ後も続く場合は throw する", async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(createRateLimitResponse("1"));

    const resultPromise = requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult);
    const expectation = expect(resultPromise).rejects.toThrow("GraphQL request failed: 429");
    await vi.advanceTimersByTimeAsync(3000);

    await expectation;
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("429 以外のエラーレスポンス時は即 throw する", async () => {
    vi.mocked(fetch).mockResolvedValue(createErrorResponse(500));

    await expect(requestGraphQL(ENDPOINT, QUERY, VARIABLES, parseTestResult)).rejects.toThrow(
      "GraphQL request failed: 500",
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

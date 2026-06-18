const MAX_RETRY_AFTER_SECONDS = 30;
const MAX_RATE_LIMIT_RETRIES = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseGraphQLErrorMessages(payload: Record<string, unknown>): string[] {
  if (!("errors" in payload) || !Array.isArray(payload.errors)) {
    return [];
  }

  return payload.errors
    .map((error) => (isRecord(error) ? error.message : undefined))
    .filter((message): message is string => typeof message === "string");
}

function parseRetryAfterSeconds(header: string | null): number | null {
  if (header === null || header.trim().length === 0) {
    return null;
  }

  const seconds = Number.parseInt(header, 10);
  if (!Number.isNaN(seconds)) {
    return seconds;
  }

  const retryAt = Date.parse(header);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return Math.ceil((retryAt - Date.now()) / 1000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function requestGraphQL<TResult>(
  endpoint: string,
  query: string,
  variables: Record<string, unknown>,
  parse: (data: unknown) => TResult,
  headers: Record<string, string> = {},
): Promise<TResult> {
  const requestInit = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ query, variables }),
  };

  let response = await fetch(endpoint, requestInit);

  let rateLimitRetryCount = 0;
  while (response.status === 429) {
    const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get("Retry-After"));
    if (
      retryAfterSeconds === null ||
      retryAfterSeconds < 0 ||
      retryAfterSeconds > MAX_RETRY_AFTER_SECONDS ||
      rateLimitRetryCount >= MAX_RATE_LIMIT_RETRIES
    ) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    rateLimitRetryCount += 1;
    await sleep(retryAfterSeconds * 1000);
    response = await fetch(endpoint, requestInit);
  }

  if (!response.ok) {
    throw new Error(`GraphQL request failed: ${response.status}`);
  }

  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new Error("GraphQL request failed");
  }

  const errorMessages = parseGraphQLErrorMessages(payload);
  if (errorMessages.length > 0) {
    throw new Error(errorMessages.join("\n") || "GraphQL request failed");
  }

  if (!("data" in payload)) {
    throw new Error("GraphQL response has no data");
  }

  return parse(payload.data);
}

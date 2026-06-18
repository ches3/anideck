import { requestGraphQL } from "./graphql.ts";

const ANNICT_GRAPHQL_ENDPOINT = "https://api.annict.com/graphql";

const FETCH_WORK_MAL_ANIME_ID_QUERY = `
  query fetchWorkMalAnimeId($id: ID!) {
    node(id: $id) {
      ... on Work {
        malAnimeId
      }
    }
  }
`;

type FetchWorkMalAnimeIdResult = {
  node?: {
    malAnimeId?: string | null;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFetchWorkMalAnimeIdResult(data: unknown): FetchWorkMalAnimeIdResult {
  if (!isRecord(data) || !("node" in data)) {
    return {};
  }

  const node = data.node;
  if (!isRecord(node) || !("malAnimeId" in node)) {
    return { node: null };
  }

  const malAnimeId = node.malAnimeId;
  return {
    node: {
      malAnimeId: typeof malAnimeId === "string" || malAnimeId === null ? malAnimeId : null,
    },
  };
}

export function getAnnictToken(): string | undefined {
  const token = process.env.ANNICT_TOKEN;
  return token !== undefined && token.length > 0 ? token : undefined;
}

export async function fetchWorkMalAnimeId(workId: string, token: string): Promise<string | null> {
  const data = await requestGraphQL(
    ANNICT_GRAPHQL_ENDPOINT,
    FETCH_WORK_MAL_ANIME_ID_QUERY,
    { id: workId },
    parseFetchWorkMalAnimeIdResult,
    { authorization: `Bearer ${token}` },
  );

  return data.node?.malAnimeId ?? null;
}

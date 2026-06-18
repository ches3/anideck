import { requestGraphQL } from "./graphql.ts";

const ANILIST_GRAPHQL_ENDPOINT = "https://graphql.anilist.co";

const FETCH_COVER_IMAGE_QUERY = `
  query fetchCoverImage($idMal: Int) {
    Media(idMal: $idMal, type: ANIME) {
      coverImage {
        extraLarge
      }
    }
  }
`;

type FetchCoverImageResult = {
  Media?: {
    coverImage?: {
      extraLarge?: string | null;
    } | null;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseFetchCoverImageResult(data: unknown): FetchCoverImageResult {
  if (!isRecord(data) || !("Media" in data)) {
    return {};
  }

  const media = data.Media;
  if (!isRecord(media) || !("coverImage" in media)) {
    return { Media: null };
  }

  const coverImage = media.coverImage;
  if (!isRecord(coverImage) || !("extraLarge" in coverImage)) {
    return { Media: { coverImage: null } };
  }

  const extraLarge = coverImage.extraLarge;
  return {
    Media: {
      coverImage: {
        extraLarge: typeof extraLarge === "string" || extraLarge === null ? extraLarge : null,
      },
    },
  };
}

export async function fetchCoverImageByMalId(malAnimeId: number): Promise<string | null> {
  const data = await requestGraphQL(
    ANILIST_GRAPHQL_ENDPOINT,
    FETCH_COVER_IMAGE_QUERY,
    { idMal: malAnimeId },
    parseFetchCoverImageResult,
  );

  return data.Media?.coverImage?.extraLarge ?? null;
}

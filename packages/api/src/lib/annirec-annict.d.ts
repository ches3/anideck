declare module "@anirec/annict" {
  export type SearchResult =
    | {
        id: string;
        title: string;
        episode:
          | {
              id: string;
              title: string | undefined;
              number: number | undefined;
              numberText: string | undefined;
            }
          | undefined;
      }
    | undefined;

  export type SearchParam =
    | { title: string }
    | { workTitle: string; episodeTitle: string }
    | { workTitle: string; episodeNumber: string; episodeTitle: string };

  export function search(params: SearchParam, token: string): Promise<SearchResult>;
}

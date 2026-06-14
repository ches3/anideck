import { createHash } from "node:crypto";

const ID_LENGTH = 22;

export function createWorkId(workTitle: string): string {
  return createHashId(workTitle);
}

export function createEpisodeId(rootId: string, relativePath: string): string {
  return createHashId(`${rootId}:${relativePath}`);
}

function createHashId(input: string): string {
  return createHash("sha256").update(input).digest("base64url").slice(0, ID_LENGTH);
}

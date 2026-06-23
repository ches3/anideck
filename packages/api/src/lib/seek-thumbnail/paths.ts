import { join } from "node:path";

import { resolveDataDir } from "../path.ts";

export const SEEK_THUMBNAIL_SPRITE_FILE = "sprite.webp";

export function resolveSeekThumbnailCacheDir(): string {
  return join(resolveDataDir(), "cache", "seek-thumbnails");
}

export function resolveSeekThumbnailSpritePath(episodeId: string): string {
  return join(resolveSeekThumbnailCacheDir(), `${episodeId}.webp`);
}

export function resolveSeekThumbnailSpriteTmpPath(episodeId: string): string {
  return join(resolveSeekThumbnailCacheDir(), `${episodeId}.tmp.webp`);
}

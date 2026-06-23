import { access, mkdir, rename, rm } from "node:fs/promises";

import { generateSeekThumbnailSprite } from "./ffmpeg.ts";
import { probeVideo } from "./ffprobe.ts";
import { buildSeekThumbnailManifest, type SeekThumbnailManifest } from "./manifest.ts";
import {
  resolveSeekThumbnailCacheDir,
  resolveSeekThumbnailSpritePath,
  resolveSeekThumbnailSpriteTmpPath,
} from "./paths.ts";

export async function generateSeekThumbnailFiles(input: {
  episodeId: string;
  sourcePath: string;
}): Promise<SeekThumbnailManifest> {
  const { episodeId, sourcePath } = input;

  await access(sourcePath);
  await mkdir(resolveSeekThumbnailCacheDir(), { recursive: true });
  await cleanupSeekThumbnailTmpFiles(episodeId);

  const probe = await probeVideo(sourcePath);
  const manifest = buildSeekThumbnailManifest({
    durationSec: probe.durationSec,
    videoWidth: probe.width,
    videoHeight: probe.height,
  });
  const spriteTmpPath = resolveSeekThumbnailSpriteTmpPath(episodeId);

  await generateSeekThumbnailSprite(sourcePath, spriteTmpPath, manifest.sprite.rows);
  await rename(spriteTmpPath, resolveSeekThumbnailSpritePath(episodeId));

  return manifest;
}

export async function cleanupSeekThumbnailTmpFiles(episodeId: string): Promise<void> {
  await rm(resolveSeekThumbnailSpriteTmpPath(episodeId), { force: true });
}

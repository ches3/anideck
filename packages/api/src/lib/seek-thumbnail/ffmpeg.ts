import { SEEK_THUMBNAIL_INTERVAL_SEC, SEEK_THUMBNAIL_THUMB_WIDTH } from "./manifest.ts";
import { spawnProcess } from "./process.ts";

const QUALITY = 30;

export async function generateSeekThumbnailSprite(
  inputPath: string,
  outputPath: string,
  rows: number,
): Promise<void> {
  const filter = `fps=1/${SEEK_THUMBNAIL_INTERVAL_SEC},scale=${SEEK_THUMBNAIL_THUMB_WIDTH}:-2,tile=10x${String(rows)}`;

  await spawnProcess("ffmpeg", [
    "-skip_frame",
    "nointra",
    "-i",
    inputPath,
    "-vf",
    filter,
    "-frames:v",
    "1",
    "-quality",
    String(QUALITY),
    outputPath,
  ]);
}

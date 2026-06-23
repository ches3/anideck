import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { Db } from "../db/index.ts";
import { episodes, sourceRoots, works } from "../db/schema.ts";
import { createTestDb, type TestDb } from "../db/test-helper.ts";
import { createEpisodeId, createWorkId } from "../work-id.ts";
import { generateSeekThumbnailFiles } from "./generation.ts";
import {
  resolveSeekThumbnailCacheDir,
  resolveSeekThumbnailSpritePath,
  resolveSeekThumbnailSpriteTmpPath,
} from "./paths.ts";

vi.mock("./ffprobe.ts", () => ({
  probeVideo: vi.fn(),
}));

vi.mock("./ffmpeg.ts", () => ({
  generateSeekThumbnailSprite: vi.fn(),
}));

import { generateSeekThumbnailSprite } from "./ffmpeg.ts";
import { probeVideo } from "./ffprobe.ts";

const ROOT_ID = "ROOT1";

describe("generateSeekThumbnailFiles", () => {
  let db: Db;
  let testDb: TestDb | undefined;
  let tempDir = "";

  beforeEach(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    tempDir = await mkdtemp(join(tmpdir(), "anideck-run-seek-thumbnail-test-"));
    vi.stubEnv("ANIDECK_DATA_DIR", join(tempDir, "data"));
    vi.mocked(probeVideo).mockResolvedValue({
      durationSec: 10,
      width: 1920,
      height: 1080,
    });
    vi.mocked(generateSeekThumbnailSprite).mockImplementation(async (_input, outputPath) => {
      await access(outputPath)
        .then(() => {
          throw new Error("output file already exists");
        })
        .catch(async (error: unknown) => {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            await writeFile(outputPath, "new-webp");
            return;
          }

          throw error;
        });
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.mocked(probeVideo).mockReset();
    vi.mocked(generateSeekThumbnailSprite).mockReset();
    await testDb?.cleanup();
    testDb = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("元動画が存在しない場合はエラーを投げる", async () => {
    const episodeId = createEpisodeId(ROOT_ID, "missing.mp4");
    await db.insert(sourceRoots).values({ id: ROOT_ID, path: tempDir });
    await db.insert(works).values({
      id: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      originalTitle: "Series A",
    });
    await db.insert(episodes).values({
      id: episodeId,
      workId: createWorkId(ROOT_ID, "Series A"),
      rootId: ROOT_ID,
      relativePath: "missing.mp4",
      originalWorkTitle: "Series A",
      originalTitle: "#01",
      active: true,
    });

    await expect(
      generateSeekThumbnailFiles({
        episodeId,
        sourcePath: join(tempDir, "missing.mp4"),
      }),
    ).rejects.toThrow();
  });

  it("サムネイルを生成して manifest を返す", async () => {
    const episodeId = createEpisodeId(ROOT_ID, "video.mp4");
    const sourcePath = join(tempDir, "video.mp4");
    await writeFile(sourcePath, "video");

    const manifest = await generateSeekThumbnailFiles({ episodeId, sourcePath });

    await expect(access(resolveSeekThumbnailSpritePath(episodeId))).resolves.toBeUndefined();
    expect(manifest.count).toBe(1);
  });

  it("残存した tmp ファイルを削除する", async () => {
    const episodeId = createEpisodeId(ROOT_ID, "video.mp4");
    const sourcePath = join(tempDir, "video.mp4");
    await writeFile(sourcePath, "video");
    await mkdir(resolveSeekThumbnailCacheDir(), { recursive: true });
    await writeFile(resolveSeekThumbnailSpriteTmpPath(episodeId), "old-webp");

    await generateSeekThumbnailFiles({ episodeId, sourcePath });

    await expect(access(resolveSeekThumbnailSpriteTmpPath(episodeId))).rejects.toThrow();
  });
});

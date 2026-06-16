import { mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { createVideoStreamResponse, getVideoContentType, parseByteRange } from "./video-stream.ts";

describe("parseByteRange", () => {
  const fileSize = 4;

  it("bytes=0-3 の場合は先頭から末尾までを返す", () => {
    expect(parseByteRange("bytes=0-3", fileSize)).toEqual({ start: 0, end: 3 });
  });

  it("bytes=1- の場合は 1 バイト目から末尾までを返す", () => {
    expect(parseByteRange("bytes=1-", fileSize)).toEqual({ start: 1, end: 3 });
  });

  it("bytes=-3 の場合は末尾 3 バイトを返す", () => {
    expect(parseByteRange("bytes=-3", fileSize)).toEqual({ start: 1, end: 3 });
  });

  it("範囲外の開始位置の場合は invalid を返す", () => {
    expect(parseByteRange("bytes=4-", fileSize)).toBe("invalid");
  });

  it("複数 Range の場合は unsupported を返す", () => {
    expect(parseByteRange("bytes=0-1,3-3", fileSize)).toBe("unsupported");
  });

  it("空ファイルの場合は invalid を返す", () => {
    expect(parseByteRange("bytes=-1", 0)).toBe("invalid");
  });

  it("不正な形式の場合は invalid を返す", () => {
    expect(parseByteRange("invalid", fileSize)).toBe("invalid");
  });
});

describe("getVideoContentType", () => {
  it("拡張子に応じた Content-Type を返す", () => {
    expect(getVideoContentType("/path/video.mp4")).toBe("video/mp4");
    expect(getVideoContentType("/path/video.webm")).toBe("video/webm");
    expect(getVideoContentType("/path/video.mkv")).toBe("video/x-matroska");
    expect(getVideoContentType("/path/video.unknown")).toBe("application/octet-stream");
  });
});

describe("createVideoStreamResponse", () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "anideck-video-stream-test-"));
    tempFilePath = join(tempDir, "test.mp4");
    await writeFile(tempFilePath, "abcd");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("Range 未指定の場合は 200 でファイル全体を返す", async () => {
    const result = await createVideoStreamResponse(tempFilePath, undefined);

    expect(result.status).toBe(200);
    if (result.status !== 200) {
      return;
    }
    expect(result.headers["Content-Length"]).toBe("4");
    expect(result.body).not.toBeNull();

    const text = await readStreamText(result.body);
    expect(text).toBe("abcd");
  });

  it("有効な Range の場合は 206 で部分バイト列を返す", async () => {
    const result = await createVideoStreamResponse(tempFilePath, "bytes=1-2");

    expect(result.status).toBe(206);
    if (result.status !== 206) {
      return;
    }
    expect(result.headers["Content-Range"]).toBe("bytes 1-2/4");
    expect(result.headers["Content-Length"]).toBe("2");

    const text = await readStreamText(result.body);
    expect(text).toBe("bc");
  });

  it("ストリーム cancel 後も同じファイルを再リクエストできる", async () => {
    const result = await createVideoStreamResponse(tempFilePath, "bytes=0-3");
    expect(result.status).toBe(206);
    if (result.status !== 206) {
      return;
    }

    const reader = result.body.getReader();
    await reader.read();
    await reader.cancel();

    const retry = await createVideoStreamResponse(tempFilePath, undefined);
    expect(retry.status).toBe(200);
    if (retry.status !== 200) {
      return;
    }
    expect(await readStreamText(retry.body)).toBe("abcd");
  });

  it("AbortSignal が abort された場合はストリーム読み取りを終了する", async () => {
    const abortController = new AbortController();
    const result = await createVideoStreamResponse(tempFilePath, undefined, abortController.signal);

    expect(result.status).toBe(200);
    if (result.status !== 200) {
      return;
    }

    abortController.abort();

    const reader = result.body.getReader();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it("AbortSignal がすでに abort されている場合も例外を投げずに終了する", async () => {
    const abortController = new AbortController();
    abortController.abort();

    const result = await createVideoStreamResponse(tempFilePath, undefined, abortController.signal);

    expect(result.status).toBe(200);
    if (result.status !== 200) {
      return;
    }

    const reader = result.body.getReader();
    await expect(reader.read()).resolves.toEqual({ done: true, value: undefined });
  });

  it("レスポンス作成後にパス先が置換されても open 済みファイルを返す", async () => {
    const result = await createVideoStreamResponse(tempFilePath, undefined);
    const replacementFilePath = join(tempDir, "replacement.mp4");
    const originalFilePath = join(tempDir, "original.mp4");

    await rename(tempFilePath, originalFilePath);
    await writeFile(replacementFilePath, "wxyz");
    await rename(replacementFilePath, tempFilePath);

    expect(result.status).toBe(200);
    if (result.status !== 200) {
      return;
    }
    expect(result.headers["Content-Length"]).toBe("4");
    expect(await readStreamText(result.body)).toBe("abcd");
  });
});

async function readStreamText(body: ReadableStream | null): Promise<string> {
  if (body === null) {
    return "";
  }

  return new Response(body).text();
}

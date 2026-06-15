import type { ReadStream } from "node:fs";
import type { FileHandle } from "node:fs/promises";
import { open } from "node:fs/promises";
import { extname } from "node:path";

import { BadRequestError, InternalError, NotFoundError } from "../errors/index.ts";

interface ByteRange {
  start: number;
  end: number;
}

type ParsedByteRange = ByteRange | "invalid" | "unsupported";

interface OpenVideoFile {
  fileHandle: FileHandle;
  fileSize: number;
}

function createVideoFileError(error: unknown, filePath: string) {
  if (error instanceof Error && "code" in error) {
    switch (error.code) {
      case "ENOENT":
        return new NotFoundError("動画ファイルが見つかりません", { path: filePath }, error);
      case "EACCES":
      case "EPERM":
      case "EISDIR":
        return new BadRequestError("動画ファイルを読み取れません", { path: filePath }, error);
    }
  }

  return new InternalError("動画ファイルの読み取りに失敗しました", { path: filePath }, error);
}

async function openVideoFile(filePath: string): Promise<OpenVideoFile> {
  let fileHandle: FileHandle;
  try {
    fileHandle = await open(filePath, "r");
  } catch (error) {
    throw createVideoFileError(error, filePath);
  }

  try {
    const stats = await fileHandle.stat();
    if (!stats.isFile()) {
      throw new BadRequestError("動画ファイルを読み取れません", { path: filePath });
    }

    return {
      fileHandle,
      fileSize: stats.size,
    };
  } catch (error) {
    await fileHandle.close().catch(() => {});
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw createVideoFileError(error, filePath);
  }
}

function fileStreamToWebStream(nodeStream: ReadStream): ReadableStream<Uint8Array> {
  const iterator = nodeStream[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const result = await iterator.next();
      if (result.done === true) {
        controller.close();
        return;
      }

      const chunk: unknown = result.value;
      if (!(chunk instanceof Uint8Array)) {
        throw new TypeError("動画ストリームから byte chunk 以外が返されました");
      }

      controller.enqueue(chunk);
    },
    cancel() {
      nodeStream.destroy();
    },
  });
}

export function getVideoContentType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();

  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    default:
      return "application/octet-stream";
  }
}

export function parseByteRange(rangeHeader: string, fileSize: number): ParsedByteRange {
  const normalizedRangeHeader = rangeHeader.trim();
  if (normalizedRangeHeader.includes(",")) {
    return "unsupported";
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(normalizedRangeHeader);
  if (!match) {
    return "invalid";
  }

  if (fileSize === 0) {
    return "invalid";
  }

  const [, startStr, endStr] = match;

  if (startStr === "" && endStr === "") {
    return "invalid";
  }

  if (startStr === "") {
    const suffixLength = Number(endStr);
    if (Number.isNaN(suffixLength) || suffixLength <= 0) {
      return "invalid";
    }

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1,
    };
  }

  const start = Number(startStr);
  const end = endStr === "" ? fileSize - 1 : Number(endStr);

  if (
    Number.isNaN(start) ||
    Number.isNaN(end) ||
    start < 0 ||
    end < 0 ||
    start >= fileSize ||
    start > end
  ) {
    return "invalid";
  }

  return {
    start,
    end: Math.min(end, fileSize - 1),
  };
}

export async function createVideoStreamResponse(filePath: string, rangeHeader: string | undefined) {
  const { fileHandle, fileSize } = await openVideoFile(filePath);
  let handedOffToStream = false;
  const contentType = getVideoContentType(filePath);
  const baseHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
  };

  try {
    if (rangeHeader === undefined) {
      const stream = fileHandle.createReadStream();
      handedOffToStream = true;

      return {
        status: 200 as const,
        headers: {
          ...baseHeaders,
          "Content-Length": String(fileSize),
        },
        body: fileStreamToWebStream(stream),
      };
    }

    const range = parseByteRange(rangeHeader, fileSize);
    if (range === "invalid") {
      return {
        status: 416 as const,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes */${fileSize}`,
        },
        body: null,
      };
    }

    if (range === "unsupported") {
      const stream = fileHandle.createReadStream();
      handedOffToStream = true;

      return {
        status: 200 as const,
        headers: {
          ...baseHeaders,
          "Content-Length": String(fileSize),
        },
        body: fileStreamToWebStream(stream),
      };
    }

    const contentLength = range.end - range.start + 1;
    const stream = fileHandle.createReadStream({
      start: range.start,
      end: range.end,
    });
    handedOffToStream = true;

    return {
      status: 206 as const,
      headers: {
        ...baseHeaders,
        "Content-Length": String(contentLength),
        "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
      },
      body: fileStreamToWebStream(stream),
    };
  } finally {
    if (!handedOffToStream) {
      await fileHandle.close().catch(() => {});
    }
  }
}

export type VideoStreamResponse = Awaited<ReturnType<typeof createVideoStreamResponse>>;

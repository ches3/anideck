import type { ReadStream } from "node:fs";
import {
  close as closeFileDescriptorCallback,
  createReadStream,
  fstat as fstatCallback,
  open as openFileDescriptorCallback,
} from "node:fs";
import { extname } from "node:path";
import { promisify } from "node:util";

import { BadRequestError, InternalError, NotFoundError } from "../errors/index.ts";

const openFileDescriptor = promisify(openFileDescriptorCallback);
const fstatFileDescriptor = promisify(fstatCallback);
const closeFileDescriptor = promisify(closeFileDescriptorCallback);

interface ByteRange {
  start: number;
  end: number;
}

type ParsedByteRange = ByteRange | "invalid" | "unsupported";

interface OpenVideoFile {
  fileDescriptor: number;
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
  let fileDescriptor: number;

  try {
    fileDescriptor = await openFileDescriptor(filePath, "r");
  } catch (error) {
    throw createVideoFileError(error, filePath);
  }

  try {
    const stats = await fstatFileDescriptor(fileDescriptor);
    if (!stats.isFile()) {
      throw new BadRequestError("動画ファイルを読み取れません", { path: filePath });
    }

    return {
      fileDescriptor,
      fileSize: stats.size,
    };
  } catch (error) {
    await closeFileDescriptor(fileDescriptor).catch(() => {});
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw createVideoFileError(error, filePath);
  }
}

function readStreamToWebStream(
  nodeStream: ReadStream,
  onClose: () => Promise<void>,
  signal?: AbortSignal,
): ReadableStream<Uint8Array> {
  const iterator = nodeStream[Symbol.asyncIterator]();
  let closed = false;
  let aborted = false;
  let removeAbortListener: (() => void) | undefined;

  async function close() {
    if (closed) {
      return;
    }

    closed = true;
    removeAbortListener?.();
    await onClose();
  }

  function isAborted() {
    return aborted;
  }

  return new ReadableStream<Uint8Array>({
    start() {
      if (signal === undefined) {
        return;
      }

      const abort = () => {
        aborted = true;
        nodeStream.destroy();
        void close();
      };

      if (signal.aborted) {
        abort();
        return;
      }

      signal.addEventListener("abort", abort, { once: true });
      removeAbortListener = () => {
        signal.removeEventListener("abort", abort);
      };
    },
    async pull(controller) {
      if (isAborted()) {
        controller.close();
        await close();
        return;
      }

      try {
        const result = await iterator.next();
        if (isAborted()) {
          controller.close();
          await close();
          return;
        }

        if (result.done === true) {
          controller.close();
          await close();
          return;
        }

        const chunk: unknown = result.value;
        if (!(chunk instanceof Uint8Array)) {
          throw new TypeError("動画ストリームから byte chunk 以外が返されました");
        }

        controller.enqueue(chunk);
      } catch (error) {
        await close().catch(() => {});
        if (isAborted()) {
          controller.close();
          return;
        }
        throw error;
      }
    },
    async cancel() {
      nodeStream.destroy();
      await close();
    },
  });
}

function createBodyStream(
  filePath: string,
  fileDescriptor: number,
  options?: { range?: ByteRange; signal?: AbortSignal },
) {
  const nodeStream = createReadStream(filePath, {
    fd: fileDescriptor,
    autoClose: true,
    ...(options?.range !== undefined ? { start: options.range.start, end: options.range.end } : {}),
  });

  return readStreamToWebStream(nodeStream, async () => {}, options?.signal);
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

export async function createVideoStreamResponse(
  filePath: string,
  rangeHeader: string | undefined,
  signal?: AbortSignal,
) {
  const { fileDescriptor, fileSize } = await openVideoFile(filePath);
  const contentType = getVideoContentType(filePath);
  const baseHeaders = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
  };

  if (rangeHeader === undefined) {
    return {
      status: 200 as const,
      headers: {
        ...baseHeaders,
        "Content-Length": String(fileSize),
      },
      body: createBodyStream(filePath, fileDescriptor, { signal }),
    };
  }

  const range = parseByteRange(rangeHeader, fileSize);
  if (range === "invalid") {
    await closeFileDescriptor(fileDescriptor).catch(() => {});
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
    return {
      status: 200 as const,
      headers: {
        ...baseHeaders,
        "Content-Length": String(fileSize),
      },
      body: createBodyStream(filePath, fileDescriptor, { signal }),
    };
  }

  const contentLength = range.end - range.start + 1;

  return {
    status: 206 as const,
    headers: {
      ...baseHeaders,
      "Content-Length": String(contentLength),
      "Content-Range": `bytes ${range.start}-${range.end}/${fileSize}`,
    },
    body: createBodyStream(filePath, fileDescriptor, { range, signal }),
  };
}

export type VideoStreamResponse = Awaited<ReturnType<typeof createVideoStreamResponse>>;

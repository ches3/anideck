import { spawnProcessWithOutput } from "./process.ts";

export interface VideoProbeResult {
  durationSec: number;
  width: number;
  height: number;
}

interface FfprobeStream {
  width?: number;
  height?: number;
}

interface FfprobeFormat {
  duration?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return value;
}

export function parseFfprobeOutput(output: FfprobeOutput): VideoProbeResult {
  const stream = output.streams?.[0];
  const width = parsePositiveNumber(stream?.width);
  const height = parsePositiveNumber(stream?.height);
  const durationSec = parsePositiveNumber(Number(output.format?.duration));

  if (width === null || height === null || durationSec === null) {
    throw new Error("動画のメタデータを取得できませんでした");
  }

  return { durationSec, width, height };
}

function isFfprobeOutput(value: unknown): value is FfprobeOutput {
  return typeof value === "object" && value !== null;
}

export async function probeVideo(filePath: string): Promise<VideoProbeResult> {
  const { stdout } = await spawnProcessWithOutput("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-show_entries",
    "format=duration",
    "-of",
    "json",
    filePath,
  ]);

  const parsed: unknown = JSON.parse(stdout);
  if (!isFfprobeOutput(parsed)) {
    throw new Error("動画のメタデータを取得できませんでした");
  }

  return parseFfprobeOutput(parsed);
}

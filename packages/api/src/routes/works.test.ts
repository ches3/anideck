import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { testClient } from "hono/testing";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { apiApp } from "../app.ts";
import { BadRequestError, NotFoundError } from "../errors/index.ts";
import { getWork, getWorkEpisode, listWorks } from "../lib/services/work.ts";
import { createWorkId } from "../lib/work-id.ts";

vi.mock("../lib/services/work.ts");

const client = testClient(apiApp);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /works", () => {
  it("works 一覧を返す", async () => {
    const mockWorks = [
      { id: createWorkId("Series A"), title: "Series A" },
      { id: createWorkId("Series B"), title: "Series B" },
    ];
    vi.mocked(listWorks).mockResolvedValue(mockWorks);

    const res = await client.works.$get();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ works: mockWorks });
    expect(listWorks).toHaveBeenCalledWith(expect.anything());
  });

  it("service が BadRequestError を投げた場合は 400 を返す", async () => {
    vi.mocked(listWorks).mockRejectedValue(new BadRequestError("指定されたパスは存在しません"));

    const res = await client.works.$get();

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json).toEqual({ error: "指定されたパスは存在しません" });
  });
});

describe("GET /works/:workId", () => {
  it("work 詳細を返す", async () => {
    const workId = createWorkId("Series A");
    const mockWork = {
      id: workId,
      title: "Series A",
      episodes: [
        {
          id: "episode-id-1",
          title: "#01",
          path: "/media/anime/Series A/#01.mp4",
        },
      ],
    };
    vi.mocked(getWork).mockResolvedValue(mockWork);

    const res = await client.works[":workId"].$get({
      param: { workId },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ work: mockWork });
    expect(getWork).toHaveBeenCalledWith(expect.anything(), workId);
  });

  it("service が NotFoundError を投げた場合は 404 を返す", async () => {
    vi.mocked(getWork).mockRejectedValue(new NotFoundError("work が見つかりません"));

    const res = await client.works[":workId"].$get({
      param: { workId: "missing-work-id" },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "work が見つかりません" });
  });
});

describe("GET /works/:workId/episodes/:episodeId", () => {
  it("work・episode・streamUrl を返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: "/media/anime/Series A/#01.mp4",
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].$get({
      param: { workId, episodeId },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({
      work: { id: workId, title: "Series A" },
      episode: { id: episodeId, title: "#01" },
      streamUrl: `/api/works/${workId}/episodes/${episodeId}/stream`,
    });
    expect(getWorkEpisode).toHaveBeenCalledWith(expect.anything(), workId, episodeId);
  });

  it("service が NotFoundError を投げた場合は 404 を返す", async () => {
    const workId = createWorkId("Series A");
    vi.mocked(getWorkEpisode).mockRejectedValue(new NotFoundError("episode が見つかりません"));

    const res = await client.works[":workId"].episodes[":episodeId"].$get({
      param: { workId, episodeId: "missing-episode-id" },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "episode が見つかりません" });
  });
});

describe("GET /works/:workId/episodes/:episodeId/stream", () => {
  let tempDir: string;
  let tempFilePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "anideck-stream-test-"));
    tempFilePath = join(tempDir, "test.mp4");
    await writeFile(tempFilePath, "abcd");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("Range 未指定の場合は動画ファイル全体のバイト列を返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: tempFilePath,
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get({
      param: { workId, episodeId },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Type")).toBe("video/mp4");
    expect(await res.text()).toBe("abcd");
  });

  it("Range: bytes=0-3 の場合は 206 で 0 バイト目から 3 バイト目までを返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: tempFilePath,
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get(
      {
        param: { workId, episodeId },
      },
      {
        headers: {
          Range: "bytes=0-3",
        },
      },
    );

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-3/4");
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(await res.text()).toBe("abcd");
  });

  it("Range: bytes=1- の場合は 206 で 1 バイト目から末尾までを返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: tempFilePath,
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get(
      {
        param: { workId, episodeId },
      },
      {
        headers: {
          Range: "bytes=1-",
        },
      },
    );

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 1-3/4");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(await res.text()).toBe("bcd");
  });

  it("Range: bytes=-3 の場合は 206 で末尾 3 バイトを返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: tempFilePath,
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get(
      {
        param: { workId, episodeId },
      },
      {
        headers: {
          Range: "bytes=-3",
        },
      },
    );

    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 1-3/4");
    expect(res.headers.get("Content-Length")).toBe("3");
    expect(await res.text()).toBe("bcd");
  });

  it("不正な Range の場合は 416 を返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: tempFilePath,
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get(
      {
        param: { workId, episodeId },
      },
      {
        headers: {
          Range: "bytes=4-",
        },
      },
    );

    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */4");
  });

  it("複数 Range の場合は Range を無視して動画ファイル全体を返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: tempFilePath,
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get(
      {
        param: { workId, episodeId },
      },
      {
        headers: {
          Range: "bytes=0-1,3-3",
        },
      },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Range")).toBeNull();
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(await res.text()).toBe("abcd");
  });

  it("空ファイルに Range ヘッダー付きでリクエストした場合は 416 を返す", async () => {
    const emptyFilePath = join(tempFilePath, "..", "empty.mp4");
    await writeFile(emptyFilePath, "");
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: emptyFilePath,
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get(
      {
        param: { workId, episodeId },
      },
      {
        headers: {
          Range: "bytes=-1",
        },
      },
    );

    expect(res.status).toBe(416);
    expect(res.headers.get("Content-Range")).toBe("bytes */0");
  });

  it("動画ファイルが存在しない場合は 404 を返す", async () => {
    const workId = createWorkId("Series A");
    const episodeId = "episode-id-1";
    vi.mocked(getWorkEpisode).mockResolvedValue({
      work: { id: workId, title: "Series A" },
      episode: {
        id: episodeId,
        title: "#01",
        path: join(tempDir, "missing.mp4"),
      },
    });

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get({
      param: { workId, episodeId },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "動画ファイルが見つかりません" });
  });

  it("service が NotFoundError を投げた場合は 404 を返す", async () => {
    const workId = createWorkId("Series A");
    vi.mocked(getWorkEpisode).mockRejectedValue(new NotFoundError("episode が見つかりません"));

    const res = await client.works[":workId"].episodes[":episodeId"].stream.$get({
      param: { workId, episodeId: "missing-episode-id" },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "episode が見つかりません" });
  });
});

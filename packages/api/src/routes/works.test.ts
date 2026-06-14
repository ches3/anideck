import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { apiApp } from "../app.ts";
import { BadRequestError, NotFoundError } from "../errors/index.ts";
import { getWork, listWorks } from "../lib/services/work.ts";
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

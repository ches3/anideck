import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { apiApp } from "../app.ts";
import { ConflictError, NotFoundError } from "../errors/index.ts";
import {
  createSourceRoot,
  deleteSourceRoot,
  listSourceRoots,
  updateSourceRoot,
} from "../lib/services/source-root.ts";
import {
  createSourceExcludeRule,
  createSourceIncludeRule,
  listSourceExcludeRules,
  listSourceIncludeRules,
} from "../lib/services/source-rule.ts";

vi.mock("../lib/services/source-root.ts");
vi.mock("../lib/services/source-rule.ts");

const client = testClient(apiApp);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /source-roots", () => {
  it("sourceRoots 一覧を返す", async () => {
    const mockRoots = [{ id: "ROOT1", path: "/media/anime" }];
    vi.mocked(listSourceRoots).mockResolvedValue(mockRoots);

    const res = await client["source-roots"].$get();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ sourceRoots: mockRoots });
  });
});

describe("POST /source-roots", () => {
  it("sourceRoot を作成できる", async () => {
    const mockRoot = { id: "ROOT1", path: "/media/anime" };
    vi.mocked(createSourceRoot).mockResolvedValue(mockRoot);

    const res = await client["source-roots"].$post({
      json: { path: "/media/anime" },
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ sourceRoot: mockRoot });
  });

  it("path が空の場合は 400 を返す", async () => {
    const res = await client["source-roots"].$post({
      json: { path: "" },
    });

    expect(res.status).toBe(400);
  });
});

describe("PATCH /source-roots/:rootId", () => {
  it("sourceRoot を更新できる", async () => {
    const mockRoot = { id: "ROOT1", path: "/media/anime2" };
    vi.mocked(updateSourceRoot).mockResolvedValue(mockRoot);

    const res = await client["source-roots"][":rootId"].$patch({
      param: { rootId: "ROOT1" },
      json: { path: "/media/anime2" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ sourceRoot: mockRoot });
  });

  it("service が NotFoundError を投げた場合は 404 を返す", async () => {
    vi.mocked(updateSourceRoot).mockRejectedValue(
      new NotFoundError("source root が見つかりません"),
    );

    const res = await client["source-roots"][":rootId"].$patch({
      param: { rootId: "ROOT1" },
      json: { path: "/media/anime2" },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "source root が見つかりません" });
  });

  it("path が空の場合は 400 を返す", async () => {
    const res = await client["source-roots"][":rootId"].$patch({
      param: { rootId: "ROOT1" },
      json: { path: "" },
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /source-roots/:rootId", () => {
  it("sourceRoot を削除できる", async () => {
    vi.mocked(deleteSourceRoot).mockResolvedValue(undefined);

    const res = await client["source-roots"][":rootId"].$delete({
      param: { rootId: "ROOT1" },
    });

    expect(res.status).toBe(204);
  });
});

describe("GET /source-roots/:rootId/include-rules", () => {
  it("includeRules 一覧を返す", async () => {
    const mockRules = [
      {
        id: "RULE1",
        rootId: "ROOT1",
        pattern: "pattern",
        sortOrder: 0,
      },
    ];
    vi.mocked(listSourceIncludeRules).mockResolvedValue(mockRules);

    const res = await client["source-roots"][":rootId"]["include-rules"].$get({
      param: { rootId: "ROOT1" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ includeRules: mockRules });
    expect(listSourceIncludeRules).toHaveBeenCalledWith(expect.anything(), "ROOT1");
  });
});

describe("POST /source-roots/:rootId/include-rules", () => {
  it("includeRule を作成できる", async () => {
    const mockRule = {
      id: "RULE1",
      rootId: "ROOT1",
      pattern: "pattern",
      sortOrder: 0,
    };
    vi.mocked(createSourceIncludeRule).mockResolvedValue(mockRule);

    const res = await client["source-roots"][":rootId"]["include-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "pattern", sortOrder: 0 },
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ includeRule: mockRule });
  });

  it("service が ConflictError を投げた場合は 409 を返す", async () => {
    vi.mocked(createSourceIncludeRule).mockRejectedValue(
      new ConflictError("同一のルールが既に存在します"),
    );

    const res = await client["source-roots"][":rootId"]["include-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "duplicate" },
    });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json).toEqual({ error: "同一のルールが既に存在します" });
  });

  it("pattern が空の場合は 400 を返す", async () => {
    const res = await client["source-roots"][":rootId"]["include-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "" },
    });

    expect(res.status).toBe(400);
  });

  it("pattern が不正な場合は 400 を返す", async () => {
    const res = await client["source-roots"][":rootId"]["include-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "(" },
    });

    expect(res.status).toBe(400);
  });

  it("sortOrder が負の場合は 400 を返す", async () => {
    const res = await client["source-roots"][":rootId"]["include-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "pattern", sortOrder: -1 },
    });

    expect(res.status).toBe(400);
  });

  it("sortOrder が未指定の場合は service に sortOrder を渡さない", async () => {
    vi.mocked(createSourceIncludeRule).mockResolvedValue({
      id: "RULE1",
      rootId: "ROOT1",
      pattern: "pattern",
      sortOrder: 0,
    });

    await client["source-roots"][":rootId"]["include-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "pattern" },
    });

    expect(createSourceIncludeRule).toHaveBeenCalledWith(expect.anything(), {
      rootId: "ROOT1",
      pattern: "pattern",
      sortOrder: undefined,
    });
  });
});

describe("GET /source-roots/:rootId/exclude-rules", () => {
  it("excludeRules 一覧を返す", async () => {
    const mockRules = [
      {
        id: "RULE1",
        rootId: "ROOT1",
        pattern: "exclude",
        sortOrder: 0,
      },
    ];
    vi.mocked(listSourceExcludeRules).mockResolvedValue(mockRules);

    const res = await client["source-roots"][":rootId"]["exclude-rules"].$get({
      param: { rootId: "ROOT1" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ excludeRules: mockRules });
    expect(listSourceExcludeRules).toHaveBeenCalledWith(expect.anything(), "ROOT1");
  });
});

describe("POST /source-roots/:rootId/exclude-rules", () => {
  it("excludeRule を作成できる", async () => {
    const mockRule = {
      id: "RULE1",
      rootId: "ROOT1",
      pattern: "exclude",
      sortOrder: 0,
    };
    vi.mocked(createSourceExcludeRule).mockResolvedValue(mockRule);

    const res = await client["source-roots"][":rootId"]["exclude-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "exclude", sortOrder: 0 },
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ excludeRule: mockRule });
  });

  it("pattern が空の場合は 400 を返す", async () => {
    const res = await client["source-roots"][":rootId"]["exclude-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "" },
    });

    expect(res.status).toBe(400);
  });

  it("pattern が不正な場合は 400 を返す", async () => {
    const res = await client["source-roots"][":rootId"]["exclude-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "(" },
    });

    expect(res.status).toBe(400);
  });

  it("sortOrder が負の場合は 400 を返す", async () => {
    const res = await client["source-roots"][":rootId"]["exclude-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "exclude", sortOrder: -1 },
    });

    expect(res.status).toBe(400);
  });

  it("sortOrder が未指定の場合は service に sortOrder を渡さない", async () => {
    vi.mocked(createSourceExcludeRule).mockResolvedValue({
      id: "RULE1",
      rootId: "ROOT1",
      pattern: "exclude",
      sortOrder: 0,
    });

    await client["source-roots"][":rootId"]["exclude-rules"].$post({
      param: { rootId: "ROOT1" },
      json: { pattern: "exclude" },
    });

    expect(createSourceExcludeRule).toHaveBeenCalledWith(expect.anything(), {
      rootId: "ROOT1",
      pattern: "exclude",
      sortOrder: undefined,
    });
  });
});

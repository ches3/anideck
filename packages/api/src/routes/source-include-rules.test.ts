import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { apiApp } from "../app.ts";
import { ConflictError, NotFoundError } from "../errors/index.ts";
import { deleteSourceIncludeRule, updateSourceIncludeRule } from "../lib/services/source-rule.ts";

vi.mock("../lib/services/source-rule.ts");

const client = testClient(apiApp);
const mockSyncResult = {
  status: "success" as const,
  annict: { status: "skipped", reason: "missing_token" } as const,
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("PATCH /source-include-rules/:ruleId", () => {
  it("includeRule を更新できる", async () => {
    const mockRule = {
      id: "RULE1",
      rootId: "ROOT1",
      pattern: "updated",
      sortOrder: 1,
    };
    vi.mocked(updateSourceIncludeRule).mockResolvedValue({ ...mockRule, sync: mockSyncResult });

    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { pattern: "updated", sortOrder: 1 },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ includeRule: mockRule, sync: mockSyncResult });
  });

  it("service が NotFoundError を投げた場合は 404 を返す", async () => {
    vi.mocked(updateSourceIncludeRule).mockRejectedValue(
      new NotFoundError("include rule が見つかりません"),
    );

    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { pattern: "updated" },
    });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json).toEqual({ error: "include rule が見つかりません" });
  });

  it("service が ConflictError を投げた場合は 409 を返す", async () => {
    vi.mocked(updateSourceIncludeRule).mockRejectedValue(
      new ConflictError("同一のルールが既に存在します"),
    );

    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { pattern: "duplicate" },
    });

    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json).toEqual({ error: "同一のルールが既に存在します" });
  });

  it("pattern が空の場合は 400 を返す", async () => {
    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { pattern: "", sortOrder: 0 },
    });

    expect(res.status).toBe(400);
  });

  it("pattern が不正な場合は 400 を返す", async () => {
    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { pattern: "(", sortOrder: 0 },
    });

    expect(res.status).toBe(400);
  });

  it("sortOrder が負の場合は 400 を返す", async () => {
    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { pattern: "updated", sortOrder: -1 },
    });

    expect(res.status).toBe(400);
  });

  it("pattern の部分更新ができる", async () => {
    const mockRule = {
      id: "RULE1",
      rootId: "ROOT1",
      pattern: "updated",
      sortOrder: 0,
    };
    vi.mocked(updateSourceIncludeRule).mockResolvedValue({ ...mockRule, sync: mockSyncResult });

    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { pattern: "updated" },
    });

    expect(res.status).toBe(200);
    expect(updateSourceIncludeRule).toHaveBeenCalledWith(expect.anything(), "RULE1", {
      pattern: "updated",
    });
  });

  it("sortOrder の部分更新ができる", async () => {
    const mockRule = {
      id: "RULE1",
      rootId: "ROOT1",
      pattern: "pattern",
      sortOrder: 1,
    };
    vi.mocked(updateSourceIncludeRule).mockResolvedValue({ ...mockRule, sync: mockSyncResult });

    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: { sortOrder: 1 },
    });

    expect(res.status).toBe(200);
    expect(updateSourceIncludeRule).toHaveBeenCalledWith(expect.anything(), "RULE1", {
      sortOrder: 1,
    });
  });

  it("body が空の場合は 400 を返す", async () => {
    const res = await client["source-include-rules"][":ruleId"].$patch({
      param: { ruleId: "RULE1" },
      json: {},
    });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /source-include-rules/:ruleId", () => {
  it("includeRule を削除できる", async () => {
    vi.mocked(deleteSourceIncludeRule).mockResolvedValue({ sync: mockSyncResult });

    const res = await client["source-include-rules"][":ruleId"].$delete({
      param: { ruleId: "RULE1" },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ sync: mockSyncResult });
    expect(deleteSourceIncludeRule).toHaveBeenCalledWith(expect.anything(), "RULE1");
  });
});

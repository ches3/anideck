import { describe, expect, it } from "vite-plus/test";

import { classifySourceRootPathFailure } from "./fs-error.ts";

describe("classifySourceRootPathFailure", () => {
  it("ENOENT は not_found になる", () => {
    const error = new Error("no such file") as NodeJS.ErrnoException;
    error.code = "ENOENT";

    expect(classifySourceRootPathFailure(error)).toBe("not_found");
  });

  it("ENOTDIR は not_directory になる", () => {
    const error = new Error("not a directory") as NodeJS.ErrnoException;
    error.code = "ENOTDIR";

    expect(classifySourceRootPathFailure(error)).toBe("not_directory");
  });

  it("EACCES は unreadable になる", () => {
    const error = new Error("permission denied") as NodeJS.ErrnoException;
    error.code = "EACCES";

    expect(classifySourceRootPathFailure(error)).toBe("unreadable");
  });

  it("code がない Error は unreadable になる", () => {
    expect(classifySourceRootPathFailure(new Error("unknown"))).toBe("unreadable");
  });
});

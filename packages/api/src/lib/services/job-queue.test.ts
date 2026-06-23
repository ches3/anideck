import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { KeyedSerialQueue } from "./job-queue.ts";

describe("KeyedSerialQueue", () => {
  let queue: KeyedSerialQueue<{ id: string }>;
  const run = vi.fn<(input: { id: string }) => Promise<void>>();

  beforeEach(() => {
    run.mockResolvedValue(undefined);
    queue = new KeyedSerialQueue({
      getKey: (job) => job.id,
      logLabel: "test job",
      run,
    });
  });

  afterEach(() => {
    run.mockReset();
  });

  it("enqueue 時に run を実行する", async () => {
    void queue.enqueue({ id: "job-1" });

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledWith({ id: "job-1" });
    });
  });

  it("queue にすでに存在する key の enqueue 時は重複投入しない", async () => {
    let resolveRun: (() => void) | undefined;
    run.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );

    const firstEnqueue = queue.enqueue({ id: "job-1" });
    const secondEnqueue = queue.enqueue({ id: "job-1" });

    await expect(firstEnqueue).resolves.toBe("queued");
    await expect(secondEnqueue).resolves.toBe("already_queued");
    resolveRun?.();

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });
  });

  it("running 中の key への再投入は rerun_requested を返し再実行する", async () => {
    let resolveRun: (() => void) | undefined;
    run.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );

    const job = { id: "job-1" };
    await expect(queue.enqueue(job)).resolves.toBe("queued");
    expect(queue.isQueuedOrRunning("job-1")).toBe(true);

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });

    await expect(queue.enqueue({ id: "job-1" })).resolves.toBe("rerun_requested");

    resolveRun?.();
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });
  });

  it("再実行時は最新の DB 状態で実行する", async () => {
    const order: string[] = [];
    let resolveFirstRun: (() => void) | undefined;

    run.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstRun = resolve;
        }),
    );
    run.mockImplementationOnce((input) => {
      order.push(input.id);
      return Promise.resolve();
    });

    void queue.enqueue({ id: "job-1" });
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });

    void queue.enqueue({ id: "job-1" });
    resolveFirstRun?.();

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });
    expect(order).toEqual(["job-1"]);
  });

  it("キューに積まれた job を順次実行する", async () => {
    let activeJobs = 0;
    run.mockImplementation(async () => {
      activeJobs += 1;
      expect(activeJobs).toBe(1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeJobs -= 1;
    });

    void queue.enqueue({ id: "job-1" });
    void queue.enqueue({ id: "job-2" });

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(2);
    });
  });

  it("job の実行に失敗した場合も running 状態を解放する", async () => {
    run.mockRejectedValue(new Error("refresh failed"));

    void queue.enqueue({ id: "job-1" });

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });

    expect(queue.isQueuedOrRunning("job-1")).toBe(false);
  });

  it("initialize に失敗した場合は enqueue 時にエラーを投げる", async () => {
    const initialize = vi.fn().mockRejectedValue(new Error("initialize failed"));
    queue = new KeyedSerialQueue({
      getKey: (job) => job.id,
      initialize,
      logLabel: "test job",
      run,
    });

    await expect(queue.enqueue({ id: "job-1" })).rejects.toThrow("initialize failed");
    expect(run).not.toHaveBeenCalled();
    expect(queue.isQueuedOrRunning("job-1")).toBe(false);
  });

  it("runningDuplicateBehavior が dedupe の場合は running 中の同じ key を再投入しない", async () => {
    let resolveRun: (() => void) | undefined;
    run.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve;
        }),
    );
    queue = new KeyedSerialQueue({
      getKey: (job) => job.id,
      logLabel: "test job",
      runningDuplicateBehavior: "dedupe",
      run,
    });

    await expect(queue.enqueue({ id: "job-1" })).resolves.toBe("queued");
    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledTimes(1);
    });

    await expect(queue.enqueue({ id: "job-1" })).resolves.toBe("already_queued");
    resolveRun?.();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(run).toHaveBeenCalledTimes(1);
  });
});

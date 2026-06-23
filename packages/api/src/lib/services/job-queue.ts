export type QueueEnqueueStatus = "queued" | "already_queued" | "rerun_requested";
export type RunningDuplicateBehavior = "rerun" | "dedupe";

export interface KeyedSerialQueueOptions<TJob> {
  getKey: (job: TJob) => string;
  initialize?: () => Promise<void>;
  logLabel: string;
  runningDuplicateBehavior?: RunningDuplicateBehavior;
  run: (job: TJob) => Promise<void>;
}

export class KeyedSerialQueue<TJob> {
  private readonly pendingKeys = new Set<string>();
  private readonly runningKeys = new Set<string>();
  private readonly rerunRequestedJobs = new Map<string, TJob>();
  private readonly queue: TJob[] = [];
  private initPromise: Promise<void> | undefined;
  private processPromise: Promise<void> = Promise.resolve();

  constructor(private readonly options: KeyedSerialQueueOptions<TJob>) {}

  isQueuedOrRunning(key: string): boolean {
    return this.pendingKeys.has(key) || this.runningKeys.has(key);
  }

  async enqueue(job: TJob): Promise<QueueEnqueueStatus> {
    await this.ensureInitialized();

    const key = this.options.getKey(job);

    if (this.runningKeys.has(key)) {
      if (this.options.runningDuplicateBehavior === "dedupe") {
        return "already_queued";
      }

      this.rerunRequestedJobs.set(key, job);
      return "rerun_requested";
    }

    if (this.pendingKeys.has(key)) {
      return "already_queued";
    }

    this.pendingKeys.add(key);
    this.queue.push(job);
    this.processPromise = this.processPromise.then(() => this.processNextJob());
    return "queued";
  }

  private ensureInitialized(): Promise<void> {
    this.initPromise ??= this.options.initialize?.() ?? Promise.resolve();
    return this.initPromise;
  }

  private async processNextJob(): Promise<void> {
    const job = this.queue.shift();
    if (job === undefined) {
      return;
    }

    const key = this.options.getKey(job);
    this.pendingKeys.delete(key);
    this.runningKeys.add(key);

    try {
      await this.options.run(job);
    } catch (error) {
      console.error(`${this.options.logLabel} failed`, {
        key,
        errorName: error instanceof Error ? error.name : "NonErrorThrowable",
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.runningKeys.delete(key);

      const rerunJob = this.rerunRequestedJobs.get(key);
      if (rerunJob !== undefined) {
        this.rerunRequestedJobs.delete(key);
        await this.enqueue(rerunJob);
      }
    }
  }
}

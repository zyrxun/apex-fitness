/**
 * The seam between "a background job runs somewhere" and "which broker runs
 * it". PLAN 4.2 calls for a real queue; until the ingestion volume justifies
 * Redis + BullMQ (Phase 3), an in-process serial worker is the honest
 * implementation — and swapping it is a config change, not a rewrite, because
 * nothing outside this file knows which one is installed.
 */
export interface QueueLike {
  /** Fire-and-forget. Resolves once the job is accepted, not once it is done. */
  enqueue(key: string, run: () => Promise<void>): Promise<void>;
  /** Resolves when the job for `key` has finished (or immediately if unknown). */
  awaitJob(key: string): Promise<void>;
  /** Resolves when nothing is queued or running. */
  awaitIdle(): Promise<void>;
  close(): Promise<void>;
}

export type QueueErrorHandler = (error: unknown, key: string) => void;

/**
 * FIFO with a single worker. Serial rather than concurrent on purpose: the
 * pipeline is CPU-bound over large arrays, and N parallel jobs on one event
 * loop would only trade throughput for latency on every HTTP request.
 */
export class SerialQueue implements QueueLike {
  #pending: { key: string; run: () => Promise<void> }[] = [];
  #running = false;
  #jobs = new Map<string, Promise<void>>();
  #idleWaiters: (() => void)[] = [];
  #closed = false;

  constructor(private readonly onError: QueueErrorHandler = () => {}) {}

  async enqueue(key: string, run: () => Promise<void>): Promise<void> {
    if (this.#closed) return;
    let settle!: () => void;
    this.#jobs.set(
      key,
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
    );
    this.#pending.push({
      key,
      run: async () => {
        try {
          await run();
        } finally {
          settle();
        }
      },
    });
    void this.#drain();
  }

  awaitJob(key: string): Promise<void> {
    return this.#jobs.get(key) ?? Promise.resolve();
  }

  awaitIdle(): Promise<void> {
    if (!this.#running && this.#pending.length === 0) return Promise.resolve();
    return new Promise((resolve) => this.#idleWaiters.push(resolve));
  }

  async close(): Promise<void> {
    this.#closed = true;
    await this.awaitIdle();
  }

  async #drain(): Promise<void> {
    if (this.#running) return;
    this.#running = true;
    try {
      while (this.#pending.length > 0) {
        const job = this.#pending.shift()!;
        try {
          await job.run();
        } catch (error) {
          this.onError(error, job.key);
        }
        this.#jobs.delete(job.key);
      }
    } finally {
      this.#running = false;
      const waiters = this.#idleWaiters;
      this.#idleWaiters = [];
      for (const resolve of waiters) resolve();
    }
  }
}

/** Runs the job before `enqueue` resolves. Useful for deterministic tests. */
export class InlineQueue implements QueueLike {
  constructor(private readonly onError: QueueErrorHandler = () => {}) {}

  async enqueue(key: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      this.onError(error, key);
    }
  }

  awaitJob(): Promise<void> {
    return Promise.resolve();
  }

  awaitIdle(): Promise<void> {
    return Promise.resolve();
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export function createQueue(mode: 'serial' | 'inline', onError?: QueueErrorHandler): QueueLike {
  return mode === 'inline' ? new InlineQueue(onError) : new SerialQueue(onError);
}

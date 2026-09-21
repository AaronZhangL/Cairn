/**
 * Resumable batch state machine.
 *
 * A 200k-word book splits into close to a hundred chapters, so the map stage is
 * close to a hundred LLM calls. This is the most fragile part of the pipeline
 * and has to hold four properties:
 *   1. Each result persists the moment it lands — a refresh loses nothing
 *   2. Concurrency is capped — never hammer the provider
 *   3. One failure does not sink the run — failures are collected, not thrown
 *   4. Progress is visible per task — not one indefinite spinner
 */

export interface JobStore<R> {
  get(taskId: string): Promise<R | undefined>;
  put(taskId: string, result: R): Promise<void>;
}

export interface JobTask<T> {
  readonly id: string;
  readonly input: T;
}

export interface JobProgress {
  readonly total: number;
  readonly done: number;
  readonly failed: number;
  readonly running: number;
  /** Tasks already persisted before this run started, and therefore skipped. */
  readonly skipped: number;
}

export interface JobFailure {
  readonly taskId: string;
  readonly attempts: number;
  readonly error: Error;
}

export interface JobResult<R> {
  readonly results: ReadonlyMap<string, R>;
  readonly failures: readonly JobFailure[];
  readonly progress: JobProgress;
  /** True when nothing failed. On false, re-running skips what already succeeded. */
  readonly complete: boolean;
}

export interface JobOptions {
  readonly concurrency?: number;
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: JobProgress) => void;
  /** Injected by tests; defaults to setTimeout. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

const DEFAULTS = { concurrency: 4, maxAttempts: 3, baseDelayMs: 500 } as const;

export class JobAbortedError extends Error {
  constructor() {
    super('任务已取消');
    this.name = 'JobAbortedError';
  }
}

export async function runJob<T, R>(
  tasks: readonly JobTask<T>[],
  worker: (input: T, taskId: string) => Promise<R>,
  store: JobStore<R>,
  options: JobOptions = {},
): Promise<JobResult<R>> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULTS.concurrency);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULTS.maxAttempts);
  const baseDelayMs = options.baseDelayMs ?? DEFAULTS.baseDelayMs;
  const sleep = options.sleep ?? defaultSleep;
  const { signal, onProgress } = options;

  const results = new Map<string, R>();
  const failures: JobFailure[] = [];

  // Resume: anything already persisted is taken back without calling the worker
  const todo: JobTask<T>[] = [];
  for (const task of tasks) {
    const existing = await store.get(task.id);
    if (existing === undefined) todo.push(task);
    else results.set(task.id, existing);
  }

  const skipped = results.size;
  let running = 0;
  let cursor = 0;

  const snapshot = (): JobProgress => ({
    total: tasks.length,
    done: results.size,
    failed: failures.length,
    running,
    skipped,
  });

  onProgress?.(snapshot());

  const runOne = async (task: JobTask<T>): Promise<void> => {
    running += 1;
    onProgress?.(snapshot());
    try {
      const value = await attempt(task, worker, maxAttempts, baseDelayMs, sleep, signal);
      await store.put(task.id, value);
      results.set(task.id, value);
    } catch (error) {
      if (error instanceof JobAbortedError) throw error;
      failures.push({
        taskId: task.id,
        attempts: maxAttempts,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    } finally {
      running -= 1;
      onProgress?.(snapshot());
    }
  };

  const lane = async (): Promise<void> => {
    while (cursor < todo.length) {
      if (signal?.aborted) throw new JobAbortedError();
      const task = todo[cursor++]!;
      await runOne(task);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, lane));

  return {
    results,
    failures,
    progress: snapshot(),
    complete: failures.length === 0,
  };
}

/** Exponential backoff with jitter, so a rate-limited batch does not retry in lockstep. */
async function attempt<T, R>(
  task: JobTask<T>,
  worker: (input: T, taskId: string) => Promise<R>,
  maxAttempts: number,
  baseDelayMs: number,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  signal?: AbortSignal,
): Promise<R> {
  let lastError: unknown;

  for (let n = 1; n <= maxAttempts; n += 1) {
    if (signal?.aborted) throw new JobAbortedError();
    try {
      return await worker(task.input, task.id);
    } catch (error) {
      lastError = error;
      if (n === maxAttempts) break;
      const backoff = baseDelayMs * 2 ** (n - 1);
      await sleep(backoff + Math.random() * backoff * 0.3, signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new JobAbortedError());
      },
      { once: true },
    );
  });
}

/** In-memory store for tests and one-off scripts; file-store.ts implements the same interface on disk. */
export function memoryStore<R>(seed?: Iterable<readonly [string, R]>): JobStore<R> & {
  readonly data: Map<string, R>;
} {
  const data = new Map<string, R>(seed);
  return {
    data,
    async get(id) {
      return data.get(id);
    },
    async put(id, result) {
      data.set(id, result);
    },
  };
}

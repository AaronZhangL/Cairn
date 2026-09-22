/**
 * Builds decks in the order the reader is walking them.
 *
 * Why this exists next to `runJob` instead of inside it: runJob's queue is a
 * fixed array walked by a cursor, which is exactly right for a batch run and
 * exactly wrong for a reader who jumps to station 10. Making that queue
 * re-orderable would put interactive concerns inside the one piece of the
 * pipeline that everything else depends on.
 *
 * So the two coexist. They share the JobStore, and the store is consulted
 * before every build, so a book half-built by the CLI resumes here and vice
 * versa. `runJob` stays the batch path; this is the interactive one.
 *
 * The reader sees the path the moment `reduce` finishes and starts walking
 * while the rest is still being built — which is the whole point, because the
 * decks are the long pole and the path is not.
 */
import type { NodeDeck, PathNode } from '../types';
import { JobAbortedError, type JobStore } from './job';

/** How many stations may be in flight, i.e. how far ahead of the reader we run. */
const DEFAULT_LOOKAHEAD = 2;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;

export interface SchedulerProgress {
  readonly total: number;
  readonly ready: number;
  readonly failed: number;
  readonly running: number;
}

export interface DeckSchedulerOptions {
  readonly nodes: readonly PathNode[];
  readonly build: (node: PathNode) => Promise<NodeDeck>;
  readonly store: JobStore<NodeDeck>;
  /**
   * The store key for a station, which is NOT its id.
   *
   * `reduce` re-runs on every generation and the model is not deterministic, so
   * `n0` routinely means a different station than it did last time. Keying the
   * cache on position would hand the reader a previous run's deck. `deckKey`
   * in `build.ts` is the fingerprint this takes; the default is only for tests.
   */
  readonly keyOf?: (node: PathNode) => string;
  /**
   * In-flight cap. Two is deliberate: a station is three to five minutes of
   * audio and a build is far quicker than that, so a deeper queue buys no
   * comfort and takes provider slots away from the reader's questions.
   */
  readonly lookahead?: number;
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly onReady?: (deck: NodeDeck, progress: SchedulerProgress) => void | Promise<void>;
  readonly onFailed?: (nodeId: string, error: Error, progress: SchedulerProgress) => void;
  readonly signal?: AbortSignal;
  /** Injected by tests; defaults to setTimeout. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface DeckScheduler {
  /** Put this station, and the ones after it, at the front of the queue. */
  focus(nodeId: string): void;
  /** Resolve when this station is playable; reject when it has finally failed. */
  waitFor(nodeId: string): Promise<NodeDeck>;
  ready(): ReadonlySet<string>;
  readonly progress: SchedulerProgress;
  /**
   * Hold off starting new stations, and return the release.
   * Used while the reader is asking a question: their call is the foreground,
   * prefetch is not, and both go through the same provider.
   */
  pause(): () => void;
  /** Resolves when nothing is left to build, or after `stop`. */
  readonly done: Promise<void>;
  stop(): void;
}

export function startDeckScheduler(options: DeckSchedulerOptions): DeckScheduler {
  const {
    nodes, build, store, onReady, onFailed, signal,
    keyOf = (node) => node.id,
    lookahead = DEFAULT_LOOKAHEAD,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    sleep = defaultSleep,
  } = options;

  const order = new Map(nodes.map((n, i) => [n.id, i]));
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const decks = new Map<string, NodeDeck>();
  const failed = new Map<string, Error>();
  const waiters = new Map<string, { resolve: (d: NodeDeck) => void; reject: (e: Error) => void }[]>();

  /** Node ids still to build, in priority order. */
  let pending = nodes.map((n) => n.id);
  let running = 0;
  let stopped = false;
  let holds = 0;
  let resumeGate: (() => void) | undefined;

  const progress = (): SchedulerProgress => ({
    total: nodes.length,
    ready: decks.size,
    failed: failed.size,
    running,
  });

  const settle = (nodeId: string, deck: NodeDeck | undefined, error?: Error): void => {
    for (const w of waiters.get(nodeId) ?? []) {
      if (deck) w.resolve(deck);
      else w.reject(error ?? new Error(`第 ${nodeId} 站未能建成`));
    }
    waiters.delete(nodeId);
  };

  const attempt = async (node: PathNode): Promise<NodeDeck> => {
    let last: unknown;
    for (let n = 1; n <= maxAttempts; n += 1) {
      if (stopped || signal?.aborted) throw new JobAbortedError();
      try {
        return await build(node);
      } catch (error) {
        last = error;
        if (error instanceof JobAbortedError) throw error;
        if (n === maxAttempts) break;
        const backoff = baseDelayMs * 2 ** (n - 1);
        await sleep(backoff + Math.random() * backoff * 0.3);
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  };

  const runOne = async (nodeId: string): Promise<void> => {
    const node = byId.get(nodeId);
    if (!node) return;

    // Store-first, exactly like runJob: a deck the CLI already built is free
    const key = keyOf(node);
    const existing = await store.get(key);
    if (existing !== undefined) {
      decks.set(nodeId, existing);
      settle(nodeId, existing);
      await onReady?.(existing, progress());
      return;
    }

    running += 1;
    try {
      const deck = await attempt(node);
      await store.put(key, deck);
      decks.set(nodeId, deck);
      running -= 1;
      settle(nodeId, deck);
      await onReady?.(deck, progress());
    } catch (error) {
      running -= 1;
      if (error instanceof JobAbortedError) throw error;
      const e = error instanceof Error ? error : new Error(String(error));
      failed.set(nodeId, e);
      settle(nodeId, undefined, e);
      onFailed?.(nodeId, e, progress());
    }
  };

  /** Wait here while paused, so a hold never interrupts a station mid-build. */
  const gate = async (): Promise<void> => {
    while (holds > 0 && !stopped) {
      await new Promise<void>((resolve) => { resumeGate = resolve; });
    }
  };

  const lane = async (): Promise<void> => {
    for (;;) {
      await gate();
      if (stopped || signal?.aborted) return;
      const next = pending.shift();
      if (next === undefined) return;
      try {
        await runOne(next);
      } catch (error) {
        if (error instanceof JobAbortedError) return;
        throw error;
      }
    }
  };

  const done = (async () => {
    const lanes = Math.max(1, Math.min(lookahead, nodes.length));
    await Promise.all(Array.from({ length: lanes }, lane));
    // Anything still waiting will never arrive once the lanes are gone
    for (const nodeId of [...waiters.keys()]) {
      settle(nodeId, decks.get(nodeId), failed.get(nodeId) ?? new Error('生成已停止'));
    }
  })();

  return {
    focus(nodeId) {
      const from = order.get(nodeId);
      if (from === undefined) return;
      // Stations at or after the reader first, then the ones they skipped past:
      // skipping is not the same as not wanting, so nothing is dropped.
      pending = [...pending].sort((a, b) => rank(order, a, from) - rank(order, b, from));
    },

    waitFor(nodeId) {
      const built = decks.get(nodeId);
      if (built) return Promise.resolve(built);
      const failure = failed.get(nodeId);
      if (failure) return Promise.reject(failure);
      if (!order.has(nodeId)) return Promise.reject(new Error(`未知站点 ${nodeId}`));

      this.focus(nodeId);
      return new Promise<NodeDeck>((resolve, reject) => {
        const list = waiters.get(nodeId) ?? [];
        list.push({ resolve, reject });
        waiters.set(nodeId, list);
      });
    },

    ready: () => new Set(decks.keys()),
    get progress() { return progress(); },

    pause() {
      holds += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        holds -= 1;
        if (holds === 0) {
          resumeGate?.();
          resumeGate = undefined;
        }
      };
    },

    done,

    stop() {
      stopped = true;
      pending = [];
      resumeGate?.();
      resumeGate = undefined;
    },
  };
}

/** Distance forward from the reader, wrapping around so nothing sorts as unreachable. */
function rank(order: ReadonlyMap<string, number>, nodeId: string, from: number): number {
  const at = order.get(nodeId);
  if (at === undefined) return Number.MAX_SAFE_INTEGER;
  return at >= from ? at - from : order.size + at;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

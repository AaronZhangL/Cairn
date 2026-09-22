/**
 * Recording of model calls, as a provider that wraps another provider.
 *
 * Why this exists: a book is close to a hundred calls, and when one of them
 * comes back wrong the only evidence today is a parsed-away exception. Changing
 * one line of a reduce prompt then costs a whole re-run to evaluate. With the
 * prompt and the raw reply on disk, a single call can be replayed on its own
 * (`scripts/replay.ts`), which is the difference between a minute and an hour.
 *
 * It is a wrapper rather than a hook inside each stage because the stages should
 * not know that tracing exists, and because wrapping is the one place that sees
 * every call — including the ones a future provider adds.
 *
 * Pure by design: it takes a sink instead of writing files, so it is testable
 * and so `packages/core` keeps its no-IO rule. The disk sink is in
 * `runtime/trace-dir.ts`.
 */
import type { LlmProvider, LlmRequest } from './types';

export interface TraceEntry {
  /** ISO timestamp of when the call returned or failed. */
  readonly at: string;
  readonly provider: string;
  /** `LlmRequest.label`, or `unlabelled` when a caller did not set one. */
  readonly label: string;
  readonly system?: string;
  readonly prompt: string;
  readonly schema?: Readonly<Record<string, unknown>>;
  /** The provider's raw text. Absent when the call threw. */
  readonly raw?: string;
  readonly error?: string;
  readonly ms: number;
}

export interface TraceSink {
  write(entry: TraceEntry): Promise<void>;
}

export const UNLABELLED = 'unlabelled';

/**
 * A sink that keeps entries in memory. For tests, and for a caller that wants
 * the last few calls without a directory.
 */
export function memoryTraceSink(limit = 200): TraceSink & {
  readonly entries: readonly TraceEntry[];
} {
  const entries: TraceEntry[] = [];
  return {
    get entries() {
      return entries;
    },
    async write(entry) {
      entries.push(entry);
      if (entries.length > limit) entries.splice(0, entries.length - limit);
    },
  };
}

/**
 * Wrap a provider so every call is recorded.
 *
 * A failing sink never fails the call: tracing is diagnostics, and losing a
 * book's generation because a log write failed would be an absurd trade.
 */
export function tracingProvider(inner: LlmProvider, sink: TraceSink): LlmProvider {
  return {
    name: inner.name,
    suggestedConcurrency: inner.suggestedConcurrency,
    overheadTokens: inner.overheadTokens,

    async complete(request: LlmRequest): Promise<string> {
      const started = Date.now();
      try {
        const raw = await inner.complete(request);
        await record(sink, base(inner, request, started), { raw });
        return raw;
      } catch (error) {
        await record(sink, base(inner, request, started), {
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        });
        throw error;
      }
    },
  };
}

function base(
  inner: LlmProvider,
  request: LlmRequest,
  started: number,
): Omit<TraceEntry, 'raw' | 'error'> {
  return {
    at: new Date().toISOString(),
    provider: inner.name,
    label: request.label ?? UNLABELLED,
    ...(request.system ? { system: request.system } : {}),
    prompt: request.prompt,
    ...(request.schema ? { schema: request.schema } : {}),
    ms: Date.now() - started,
  };
}

async function record(
  sink: TraceSink,
  entry: Omit<TraceEntry, 'raw' | 'error'>,
  outcome: { raw?: string; error?: string },
): Promise<void> {
  try {
    await sink.write({ ...entry, ...outcome });
  } catch {
    // Diagnostics must never take down the run they are diagnosing
  }
}

/**
 * The model, plus optional recording.
 *
 * Tracing is off unless `CAIRN_TRACE=1`, and deliberately so: a trace holds the
 * prompts, which for the map stage is the book's text a second time. That is a
 * cost the owner should opt into on the evening they are debugging a prompt,
 * not one they pay on every run.
 *
 * Traces stay under the book's cache directory, which is already where
 * everything derived from the book lives and is already gitignored. Nothing
 * here leaves the machine.
 */
import { join } from 'node:path';
import { tracingProvider } from '@cairn/core/llm';
import type { LlmProvider } from '@cairn/core/llm';
import { codexCliProvider, traceDirSink } from '@cairn/core/runtime';
import { DATA_DIR } from './store';

const base = codexCliProvider();

export const tracingEnabled = process.env.CAIRN_TRACE === '1';

/** Where a book's recorded calls land, for `bun run replay`. */
export const traceDir = (bookId: string): string =>
  join(DATA_DIR, '.cache', bookId, 'trace');

/**
 * The provider for work done on one book's behalf.
 * Untraced calls (a question about a book that is not being generated) can use
 * `plain`.
 */
export function traced(bookId: string): LlmProvider {
  return tracingEnabled ? tracingProvider(base, traceDirSink(traceDir(bookId))) : base;
}

export const plain = base;

/**
 * The model, plus optional recording.
 *
 * Two ways to reach it, both behind `LlmProvider` so the choice is a setting
 * rather than a code change:
 *
 *  - **A configured provider** — whichever of `shared/providers.ts` the reader
 *    holds a key for, called through pi-ai.
 *  - **The codex CLI** — the original, kept for when nothing is configured. It
 *    costs ~18k tokens of agent harness per call, which is why it is no longer
 *    what runs by default and why it reports itself as not ready.
 *
 * Tracing is off unless turned on — by `CAIRN_TRACE=1` or in settings — and
 * deliberately so: a trace holds the prompts, which for the map stage is the
 * book's text a second time. That is a cost the owner should opt into on the
 * evening they are debugging a prompt, not one they pay on every run.
 *
 * Traces stay under the book's cache directory, which is already where
 * everything derived from the book lives and is already gitignored. Nothing
 * here leaves the machine.
 */
import { join } from 'node:path';
import { tracingProvider } from '@cairn/core/llm';
import type { LlmProvider } from '@cairn/core/llm';
import { codexCliProvider, traceDirSink } from '@cairn/core/runtime';
import { modelOf, type ModelStatus, type ShellSettingsValues } from '../shared/settings';
import { piLlmProvider } from './pi-provider';
import { readSettings, tracingOn } from './settings';
import { DATA_DIR } from './store';

/** Where a book's recorded calls land, for `bun run replay`. */
export const traceDir = (bookId: string): string =>
  join(DATA_DIR, '.cache', bookId, 'trace');

/**
 * Build the provider the current settings ask for.
 *
 * Resolved per run rather than once at import: the reader can change this in
 * the settings panel while a book is open, and the next run should honour it
 * without a restart.
 */
export async function resolveProvider(
  settings?: ShellSettingsValues,
): Promise<{ readonly provider: LlmProvider; readonly status: ModelStatus }> {
  const stored = settings ?? await readSettings();
  const id = stored.generationProvider;
  const profile = stored.providers[id];
  const model = modelOf(stored, id);
  const apiKey = profile?.apiKey.trim() ?? '';
  const baseUrl = profile?.baseUrl.trim() ?? '';

  // No key is not an error yet — the reader may be halfway through typing one.
  // Generation is what surfaces it, and the panel says so before then.
  if (apiKey.length === 0 && !baseUrl) {
    return {
      provider: codexCliProvider(),
      status: { provider: 'codex-cli', ready: false, detail: 'no-api-key' },
    };
  }

  return {
    provider: piLlmProvider({
      providerId: id,
      apiKey,
      model,
      ...(baseUrl ? { baseUrl } : {}),
    }),
    status: { provider: id, ready: true, detail: model },
  };
}

export async function modelStatus(): Promise<ModelStatus> {
  return (await resolveProvider()).status;
}

/** The provider for work done on one book's behalf, recorded under its cache when tracing is on. */
export async function providerFor(bookId: string): Promise<LlmProvider> {
  const { provider } = await resolveProvider();
  return (await tracingOn()) ? tracingProvider(provider, traceDirSink(traceDir(bookId))) : provider;
}

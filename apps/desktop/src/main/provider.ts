/**
 * The model, plus optional recording.
 *
 * Whichever provider of `shared/providers.ts` has credentials — a key, or for
 * `openai-codex` the `codex login` account — called through pi-ai.
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
import { CairnError } from '@cairn/core/errors';
import { type CodexCredentials, traceDirSink } from '@cairn/core/runtime';
import type { ModelStatus, ShellSettingsValues } from '../shared/settings';
import { codexCredentials } from './codex-provider';
import { resolveRoute } from './route';
import { piLlmProvider } from './pi-provider';
import { readSettings, tracingOn } from './settings';
import { DATA_DIR } from './store';

/** Where a book's recorded calls land, for `bun run replay`. */
export const traceDir = (bookId: string): string =>
  join(DATA_DIR, '.cache', bookId, 'trace');

/** What resolving reads besides settings; injected by tests so they never see this machine's login. */
export interface ResolveInputs {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly codex?: () => Promise<CodexCredentials | undefined>;
}

/**
 * Build the provider that will actually answer: see `route.ts` for which.
 *
 * Resolved per run rather than once at import: the reader can change this in
 * the settings panel while a book is open, and the next run should honour it
 * without a restart.
 */
export async function resolveProvider(
  settings?: ShellSettingsValues,
  inputs: ResolveInputs = {},
): Promise<{ readonly provider: LlmProvider | undefined; readonly status: ModelStatus }> {
  const stored = settings ?? await readSettings();
  const route = resolveRoute(stored, inputs.env ?? process.env, await (inputs.codex ?? codexCredentials)());

  // No key is not an error yet — the reader may be halfway through typing one.
  // Generation is what surfaces it, and the panel says so before then.
  if (!route) {
    return { provider: undefined, status: { provider: stored.generationProvider, ready: false, detail: 'no-api-key' } };
  }

  return {
    provider: piLlmProvider({
      providerId: route.id,
      apiKey: route.apiKey,
      model: route.model,
      ...(route.baseUrl ? { baseUrl: route.baseUrl } : {}),
      ...(route.codex ? { codex: route.codex } : {}),
    }),
    status: { provider: route.id, ready: true, detail: route.model },
  };
}

export async function modelStatus(): Promise<ModelStatus> {
  return (await resolveProvider()).status;
}

/** The provider for work done on one book's behalf, recorded under its cache when tracing is on. */
export async function providerFor(bookId: string): Promise<LlmProvider> {
  const { provider } = await resolveProvider();
  if (!provider) throw new CairnError('no_model');
  return (await tracingOn()) ? tracingProvider(provider, traceDirSink(traceDir(bookId))) : provider;
}

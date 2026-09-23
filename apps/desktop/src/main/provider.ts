/**
 * The model, plus optional recording.
 *
 * Three ways to reach it, all behind `LlmProvider` so the choice is a setting
 * rather than a code change:
 *
 *  - **ChatGPT login** — whatever `codex` stored in `~/.codex`. Nothing to set
 *    up on a machine that already has it, and no per-token cost beyond the
 *    subscription. It talks to ChatGPT's own backend; read the note at the top
 *    of `runtime/chatgpt-codex.ts` before shipping a build that defaults to it.
 *  - **API key** — the licensed path, and any OpenAI-compatible endpoint.
 *  - **The codex CLI** — the original, kept as the fallback for when neither
 *    HTTP route is configured. It costs ~18k tokens of agent harness per call,
 *    which is why it is no longer what runs by default.
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
import {
  chatGptCodexProvider, codexCliProvider, httpLlmProvider, readCodexLogin, refreshCodexLogin,
  traceDirSink,
} from '@cairn/core/runtime';
import {
  DEFAULT_OPENAI_BASE_URL, type ModelStatus, type ShellSettingsValues,
} from '../shared/settings';
import { readSettings } from './settings';
import { DATA_DIR } from './store';

/** Where a book's recorded calls land, for `bun run replay`. */
export const traceDir = (bookId: string): string =>
  join(DATA_DIR, '.cache', bookId, 'trace');

/** Used when an OpenAI-compatible endpoint is configured but no model named. */
const FALLBACK_HTTP_MODEL = 'gpt-4o-mini';

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
  const { model } = settings ?? await readSettings();

  if (model.source === 'key') {
    const apiKey = model.apiKey.trim();
    const baseUrl = model.baseUrl.trim() || DEFAULT_OPENAI_BASE_URL;
    if (apiKey.length === 0) {
      // Not an error yet — the reader may be halfway through typing one in.
      // Generation is what surfaces it, and the panel says so before then.
      return {
        provider: codexCliProvider(),
        status: { provider: 'codex-cli', ready: false, detail: 'no-api-key' },
      };
    }
    return {
      provider: httpLlmProvider({
        apiKey,
        baseUrl,
        model: model.model.trim() || FALLBACK_HTTP_MODEL,
      }),
      status: { provider: 'http', ready: true, detail: baseUrl },
    };
  }

  const login = await readCodexLogin();

  if (login.kind === 'oauth') {
    return {
      provider: chatGptCodexProvider({
        accessToken: login.accessToken,
        accountId: login.accountId,
        model: model.model.trim() || login.model,
        // Only when one was stored. A login old enough to lack a refresh token
        // still works until it expires, and then says so.
        ...(login.refreshToken ? { refresh: (signal) => refreshCodexLogin(undefined, signal) } : {}),
      }),
      status: { provider: 'chatgpt-codex', ready: true, detail: model.model.trim() || login.model },
    };
  }

  if (login.kind === 'apiKey') {
    return {
      provider: httpLlmProvider({
        apiKey: login.apiKey,
        baseUrl: login.baseUrl || DEFAULT_OPENAI_BASE_URL,
        model: model.model.trim() || login.model,
      }),
      status: { provider: 'http', ready: true, detail: login.baseUrl || DEFAULT_OPENAI_BASE_URL },
    };
  }

  // Nothing stored in `~/.codex`. The CLI has its own ways of finding a login,
  // so it is the fallback rather than an outright failure.
  return {
    provider: codexCliProvider(),
    status: { provider: 'codex-cli', ready: false, detail: 'no-codex-login' },
  };
}

export async function modelStatus(): Promise<ModelStatus> {
  return (await resolveProvider()).status;
}

/**
 * The provider for work done on one book's behalf.
 * Calls that belong to no book (a question about a finished one) pass `false`.
 */
export async function traced(bookId: string, enabled: boolean): Promise<LlmProvider> {
  const { provider } = await resolveProvider();
  return enabled ? tracingProvider(provider, traceDirSink(traceDir(bookId))) : provider;
}

/** For calls that belong to no particular book. */
export async function plainProvider(): Promise<LlmProvider> {
  return (await resolveProvider()).provider;
}

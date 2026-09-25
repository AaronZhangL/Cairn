/**
 * Borrow whatever the Codex CLI already stored in `~/.codex`.
 *
 * The point is to drop the subprocess without making the owner dig out a key
 * they already have. If `codex` is logged in on this machine, everything needed
 * to call the model directly is sitting in `auth.json`, and an HTTP call with
 * it does the same work without the agent harness wrapped around every request.
 *
 * Two shapes come out of that file: an **API key** for the public API, and a
 * **ChatGPT OAuth token** for ChatGPT's own backend — undocumented, and what
 * `llm-space` ships, but not a licensed integration. The companion reads it
 * through `main/companion/model.ts`.
 *
 * Nothing here decides which to use. It reports what is on disk; the caller
 * picks, and the settings panel is where that choice is made visible.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface CodexApiKeyLogin {
  readonly kind: 'apiKey';
  readonly apiKey: string;
  /** Empty when `config.toml` names none; the caller supplies a default. */
  readonly baseUrl: string;
  readonly model: string;
}

export interface CodexOAuthLogin {
  readonly kind: 'oauth';
  readonly accessToken: string;
  /** The backend requires this alongside the token; without it every call 401s. */
  readonly accountId: string;
  readonly model: string;
  /** Absent on a login old enough not to have stored one. */
  readonly refreshToken?: string;
}

export type CodexLogin =
  | { readonly kind: 'none' }
  | CodexApiKeyLogin
  | CodexOAuthLogin;

/** What `codex` falls back to, and what a ChatGPT login is most likely to allow. */
export const FALLBACK_CODEX_MODEL = 'gpt-5.6-sol';

/**
 * Where a ChatGPT login is renewed, and as whom.
 *
 * A plain OAuth refresh against OpenAI's own auth host — not the undocumented
 * backend the completions go to. The client id is the Codex CLI's public one;
 * it has to be, because the refresh token was issued to it.
 */
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

export async function readCodexLogin(
  codexDir = join(homedir(), '.codex'),
): Promise<CodexLogin> {
  const auth = await readJson(join(codexDir, 'auth.json'));
  if (!auth) return { kind: 'none' };

  const config = await readConfig(join(codexDir, 'config.toml'));
  const model = config.model || FALLBACK_CODEX_MODEL;

  // An API key wins when both are present: it is the licensed path.
  const apiKey = firstString(auth.OPENAI_API_KEY, auth.apiKey);
  if (apiKey) return { kind: 'apiKey', apiKey, baseUrl: config.baseUrl, model };

  const tokens = auth.tokens as {
    access_token?: unknown; account_id?: unknown; refresh_token?: unknown;
  } | undefined;
  const accessToken = firstString(tokens?.access_token);
  const accountId = firstString(tokens?.account_id);
  const refreshToken = firstString(tokens?.refresh_token);
  if (accessToken && accountId) {
    return {
      kind: 'oauth', accessToken, accountId, model,
      ...(refreshToken ? { refreshToken } : {}),
    };
  }

  return { kind: 'none' };
}

export interface RefreshedTokens {
  readonly accessToken: string;
  /** Present when the server rotated it; the old one is then dead. */
  readonly refreshToken?: string;
}

/**
 * Renew an expired ChatGPT access token.
 *
 * The result is written back into `auth.json` by `refreshCodexLogin` rather
 * than kept in memory, and that is deliberate: if the server rotates the
 * refresh token, the one still on disk is dead the moment this succeeds — and
 * the `codex` CLI reads the same file. Refreshing without writing back would
 * quietly break the tool the credentials came from.
 */
export async function refreshAccessToken(
  refreshToken: string,
  signal?: AbortSignal,
): Promise<RefreshedTokens | undefined> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CODEX_CLIENT_ID,
    }),
    ...(signal ? { signal } : {}),
  }).catch(() => undefined);

  if (!res?.ok) return undefined;

  const body = (await res.json().catch(() => undefined)) as
    { access_token?: unknown; refresh_token?: unknown } | undefined;
  const accessToken = firstString(body?.access_token);
  if (!accessToken) return undefined;

  const rotated = firstString(body?.refresh_token);
  return { accessToken, ...(rotated ? { refreshToken: rotated } : {}) };
}

/**
 * Refresh the stored login and persist it, returning the usable token.
 *
 * Every other field in `auth.json` is preserved: it belongs to the CLI, and
 * this only has business updating the two values it just renewed.
 */
export async function refreshCodexLogin(
  codexDir = join(homedir(), '.codex'),
  signal?: AbortSignal,
): Promise<string | undefined> {
  const path = join(codexDir, 'auth.json');
  const auth = await readJson(path);
  const tokens = auth?.tokens as Record<string, unknown> | undefined;
  const refreshToken = firstString(tokens?.refresh_token);
  if (!auth || !tokens || !refreshToken) return undefined;

  const next = await refreshAccessToken(refreshToken, signal);
  if (!next) return undefined;

  const updated = {
    ...auth,
    tokens: {
      ...tokens,
      access_token: next.accessToken,
      ...(next.refreshToken ? { refresh_token: next.refreshToken } : {}),
    },
    last_refresh: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(updated, null, 2), 'utf8').catch(() => undefined);
  return next.accessToken;
}

function firstString(...values: readonly unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

async function readJson(path: string): Promise<Record<string, unknown> | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    // Absent, unreadable, or not JSON. All three mean "not logged in here".
    return undefined;
  }
}

/**
 * The two keys worth reading out of `config.toml`.
 *
 * Deliberately regexes rather than a TOML parser: two optional values do not
 * justify a dependency, and a config this cannot read falls back to defaults
 * rather than failing the whole run.
 */
export async function readConfig(
  path: string,
): Promise<{ readonly model: string; readonly baseUrl: string }> {
  const toml = await readFile(path, 'utf8').catch(() => '');
  return {
    model: toml.match(/^\s*model\s*=\s*["']([^"']+)["']/m)?.[1] ?? '',
    baseUrl: toml.match(/^\s*base_url\s*=\s*["']([^"']+)["']/m)?.[1] ?? '',
  };
}

/**
 * Borrow whatever the Codex CLI already stored in `~/.codex`, so the
 * `openai-codex` provider needs no key of its own.
 *
 * The same reading as llm-space: a ChatGPT OAuth token first — ChatGPT's own
 * backend, undocumented and not a licensed integration — then an API key.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The APIs a `wire_api` in `config.toml` can name. */
export type CodexWireApi = 'openai-completions' | 'anthropic-messages' | 'openai-responses';

export type CodexCredentials =
  | { readonly mode: 'oauth'; readonly apiKey: string }
  | {
    readonly mode: 'apiKey';
    readonly apiKey: string;
    readonly api: CodexWireApi;
    /** Empty when `config.toml` names no endpoint. */
    readonly baseUrl: string;
  };

const WIRE_API: Readonly<Record<string, CodexWireApi>> = {
  completions: 'openai-completions',
  messages: 'anthropic-messages',
  responses: 'openai-responses',
};

/**
 * Where a ChatGPT login is renewed, and as whom.
 *
 * A plain OAuth refresh against OpenAI's own auth host — not the undocumented
 * backend the completions go to. The client id is the Codex CLI's public one;
 * it has to be, because the refresh token was issued to it.
 */
const TOKEN_URL = 'https://auth.openai.com/oauth/token';
const CODEX_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';

/** The same rules as llm-space's `getCodexCredentials`: the signed-in account first, then an API key. */
export async function readCodexCredentials(
  codexDir = join(homedir(), '.codex'),
): Promise<CodexCredentials | undefined> {
  const auth = await readJson(join(codexDir, 'auth.json'));
  if (!auth) return undefined;

  const tokens = auth.tokens as { access_token?: unknown } | undefined;
  const oauthToken = firstString(tokens?.access_token);
  if (oauthToken) return { mode: 'oauth', apiKey: oauthToken };

  const apiKey = firstString(auth.OPENAI_API_KEY);
  if (!apiKey) return undefined;

  const provider = await activeModelProvider(join(codexDir, 'config.toml'));
  return {
    mode: 'apiKey',
    apiKey,
    api: provider?.api ?? 'openai-responses',
    baseUrl: provider?.baseUrl ?? '',
  };
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

/** The `[model_providers.<name>]` section `model_provider` points at, if it names an endpoint. */
async function activeModelProvider(
  path: string,
): Promise<{ readonly api: CodexWireApi; readonly baseUrl: string } | undefined> {
  const lines = (await readFile(path, 'utf8').catch(() => '')).split('\n');
  const active = lines
    .map((line) => /^\s*model_provider\s*=\s*"([^"]+)"/.exec(line)?.[1])
    .find((value) => value !== undefined);
  if (!active) return undefined;

  const header = `[model_providers.${active}]`;
  let inSection = false;
  let baseUrl: string | undefined;
  let wireApi: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === header) { inSection = true; continue; }
    if (inSection && trimmed.startsWith('[')) break;
    if (!inSection) continue;
    const match = /^(\w+)\s*=\s*"([^"]*)"/.exec(trimmed);
    if (match?.[1] === 'base_url') baseUrl = match[2];
    else if (match?.[1] === 'wire_api') wireApi = match[2];
  }
  if (!baseUrl) return undefined;
  return { api: (wireApi ? WIRE_API[wireApi] : undefined) ?? 'openai-responses', baseUrl };
}

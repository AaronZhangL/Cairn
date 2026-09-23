/**
 * The model through a ChatGPT login, over HTTP rather than the codex CLI.
 *
 * Same account and same allowance as `codex exec`, without the agent harness
 * around every call — that harness is ~18k tokens a call, and it is the reason
 * the map stage batches chapters at all. A probe of this endpoint cost 50 input
 * tokens for the whole request.
 *
 * **This is ChatGPT's own backend, not the public API.** The endpoint is
 * undocumented, and the request identifies itself with an `originator` header
 * the way the Codex CLI does. It works, and it is what `llm-space` ships, but
 * it is not a licensed integration — if that matters for how this app is
 * distributed, use `httpLlmProvider` with a real API key instead. Both sit
 * behind `LlmProvider`, so the choice is configuration.
 *
 * Everything below was checked against the live endpoint rather than inferred:
 * strict `json_schema` in `text.format` is honoured, the reply streams as
 * `response.output_text.delta` events, and `response.completed` does *not*
 * repeat the text — reading only the final event returns nothing.
 */
import { LlmError, type LlmProvider, type LlmRequest } from '../llm/types';

const ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';
const DEFAULT_TIMEOUT_MS = 180_000;

export interface ChatGptCodexConfig {
  readonly accessToken: string;
  readonly accountId: string;
  /** As named in `~/.codex/config.toml`; a ChatGPT login rejects most others. */
  readonly model: string;
  readonly timeoutMs?: number;
  readonly concurrency?: number;
  readonly fetch?: typeof globalThis.fetch;
  /**
   * Renew the access token and return the new one, or nothing if it cannot be.
   *
   * Injected rather than imported so this file stays about one endpoint, and so
   * a caller with no stored refresh token simply omits it.
   */
  readonly refresh?: (signal?: AbortSignal) => Promise<string | undefined>;
}

/** Measured on a live call: 50 input tokens for a request with 12 of prompt. */
const OVERHEAD_TOKENS = 400;

export function chatGptCodexProvider(config: ChatGptCodexConfig): LlmProvider {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = config.fetch ?? globalThis.fetch;

  /**
   * The live token. A stored one expires, and near a hundred calls a book means
   * that will happen mid-run — so it is renewed once and the rest of the run
   * carries on, rather than every remaining station failing.
   */
  let token = config.accessToken;
  /** One refresh at a time: the lanes run concurrently and would all race it. */
  let refreshing: Promise<string | undefined> | undefined;

  const renew = async (signal?: AbortSignal): Promise<boolean> => {
    if (!config.refresh) return false;
    refreshing ??= config.refresh(signal).finally(() => { refreshing = undefined; });
    const next = await refreshing;
    if (next) token = next;
    return next !== undefined;
  };

  return {
    name: 'chatgpt-codex',
    // An HTTP call is not a whole agent process, so this tolerates more than
    // the CLI's 2 — bounded by the account's rate limit rather than the machine.
    suggestedConcurrency: config.concurrency ?? 4,
    overheadTokens: OVERHEAD_TOKENS,

    async complete(request: LlmRequest): Promise<string> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const onAbort = (): void => controller.abort();
      request.signal?.addEventListener('abort', onAbort, { once: true });

      const body = JSON.stringify({
        model: config.model,
        instructions: request.system ?? 'Output JSON only.',
        input: [{ role: 'user', content: [{ type: 'input_text', text: request.prompt }] }],
        // Both are required by this backend: it refuses `store: true`, and the
        // non-streaming form is not offered here.
        stream: true,
        store: false,
        ...(request.schema
          ? {
            text: {
              format: {
                type: 'json_schema',
                name: schemaName(request.label),
                strict: true,
                schema: request.schema,
              },
            },
          }
          : {}),
      });

      const send = (): Promise<Response> => doFetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
          'chatgpt-account-id': config.accountId,
          originator: 'cairn',
          accept: 'text/event-stream',
        },
        body,
        signal: controller.signal,
      });

      try {
        let res = await send();

        // A stored token expires, and a book is near a hundred calls — so this
        // will happen mid-run. Renew once and carry on, rather than failing
        // every station that was still queued behind it.
        if ((res.status === 401 || res.status === 403) && await renew(request.signal)) {
          res = await send();
        }

        if (res.status === 401 || res.status === 403) {
          throw new LlmError('ChatGPT 登录已过期，重新运行 `codex` 登录一次', 'provider_failed');
        }
        if (!res.ok) {
          const detail = (await res.text().catch(() => '')).slice(-400);
          throw new LlmError(`模型接口返回 ${res.status}`, 'provider_failed', detail);
        }

        return collect(await res.text());
      } catch (cause) {
        if (cause instanceof LlmError) throw cause;
        if (request.signal?.aborted) throw new LlmError('调用已取消', 'aborted');
        if (controller.signal.aborted) throw new LlmError('模型接口超时', 'timeout');
        throw new LlmError('模型接口请求失败', 'provider_failed', String(cause).slice(0, 300));
      } finally {
        clearTimeout(timer);
        request.signal?.removeEventListener('abort', onAbort);
      }
    },
  };
}

/** The API constrains this more tightly than our trace labels do. */
function schemaName(label: string | undefined): string {
  const cleaned = (label ?? 'result').replace(/[^a-zA-Z0-9_-]/g, '_');
  return cleaned.length > 0 ? cleaned : 'result';
}

/**
 * The assistant's text, accumulated from the stream.
 *
 * Built from the deltas, not from `response.completed` — that event arrives
 * with an empty `output` on this backend, so reading it alone yields nothing
 * while the usage figures say tokens were produced.
 */
export function collect(sse: string): string {
  let text = '';
  let failure: string | undefined;

  for (const line of sse.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload.length === 0 || payload === '[DONE]') continue;

    let event: { type?: string; delta?: unknown; text?: unknown; response?: unknown };
    try {
      event = JSON.parse(payload) as typeof event;
    } catch {
      // A partial frame is not fatal; the deltas that did parse still stand
      continue;
    }

    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      text += event.delta;
    }
    // Belt and braces: if the deltas were missed, the done event carries it whole
    if (event.type === 'response.output_text.done' && typeof event.text === 'string' && text.length === 0) {
      text = event.text;
    }
    if (event.type === 'response.failed' || event.type === 'response.incomplete') {
      failure = JSON.stringify(event.response).slice(0, 300);
    }
  }

  if (failure !== undefined) throw new LlmError('模型未能完成这次回答', 'provider_failed', failure);
  if (text.trim().length === 0) throw new LlmError('模型未返回内容', 'bad_output', sse.slice(0, 300));
  return text;
}

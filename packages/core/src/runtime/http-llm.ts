/**
 * Calls the model over HTTP instead of spawning the codex CLI.
 *
 * Why this exists beside `codex-cli.ts` rather than replacing it outright: the
 * CLI is an agent harness, and every call pays roughly 18k tokens for a harness
 * this pipeline does not use. That overhead is what forced the map stage to
 * batch chapters (`DEFAULT_BATCH_SIZE`), which makes the per-chapter notes
 * worse than they need to be. A plain endpoint costs a few hundred tokens of
 * envelope instead.
 *
 * It also makes the app shippable. A subprocess provider requires the reader to
 * have installed a developer CLI; a key in the settings panel does not.
 *
 * The wire format is the OpenAI chat-completions shape, which is what the
 * schemas in `pipeline/` were already written for — `slides.ts` notes that
 * structured output "requires `required` to list every key in `properties`",
 * which is that API's strict mode. It is also the shape almost every other
 * vendor and local server speaks, so one implementation reaches all of them.
 */
import { LlmError, type LlmProvider, type LlmRequest } from '../llm/types';

export interface HttpLlmConfig {
  /** Without a trailing `/v1`; that is appended. */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs?: number;
  /**
   * How many calls to keep in flight. Far more than the CLI tolerates — each
   * of those was a whole agent process — but still bounded, because the limit
   * here is the provider's rate limit rather than the machine.
   */
  readonly concurrency?: number;
  /** Injected by tests. */
  readonly fetch?: typeof globalThis.fetch;
}

const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_CONCURRENCY = 4;

/**
 * The envelope: system and user messages, the schema, and the reply's wrapper.
 * Measured against a request with no prompt in it; the real figure moves with
 * the schema, which for the slides stage is the largest part of it.
 */
const OVERHEAD_TOKENS = 400;

export function httpLlmProvider(config: HttpLlmConfig): LlmProvider {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = config.fetch ?? globalThis.fetch;
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  return {
    name: 'http',
    suggestedConcurrency: config.concurrency ?? DEFAULT_CONCURRENCY,
    overheadTokens: OVERHEAD_TOKENS,

    async complete(request: LlmRequest): Promise<string> {
      const body = {
        model: config.model,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content: request.prompt },
        ],
        ...(request.schema
          ? {
            response_format: {
              type: 'json_schema',
              json_schema: {
                // The label names the call for tracing, and doubles as the
                // schema name the API requires. Its charset is narrower.
                name: (request.label ?? 'result').replace(/[^a-zA-Z0-9_-]/g, '_'),
                strict: true,
                schema: request.schema,
              },
            },
          }
          : {}),
      };

      const text = await post(doFetch, endpoint, config.apiKey, body, timeoutMs, request.signal);
      const content = firstMessage(text);
      if (content.trim().length === 0) throw new LlmError('模型未返回内容', 'bad_output', text.slice(0, 300));
      return content;
    },
  };
}

async function post(
  doFetch: typeof globalThis.fetch,
  endpoint: string,
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string> {
  // One controller for both reasons a call can end early, so the fetch sees a
  // single signal and the caller's abort is not lost behind the timeout's.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(-400);
      throw new LlmError(`模型接口返回 ${res.status}`, 'provider_failed', detail);
    }
    return await res.text();
  } catch (cause) {
    if (cause instanceof LlmError) throw cause;
    // An abort from either source lands here; which one it was decides the code
    if (signal?.aborted) throw new LlmError('调用已取消', 'aborted');
    if (controller.signal.aborted) throw new LlmError('模型接口超时', 'timeout');
    throw new LlmError('模型接口请求失败', 'provider_failed', String(cause).slice(0, 300));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** The assistant's text, or nothing when the reply is not the shape we expect. */
export function firstMessage(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new LlmError('模型接口返回的不是 JSON', 'bad_output', raw.slice(0, 300));
  }

  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    // A refusal or a content filter comes back shaped like this, and saying
    // "no content" would hide a message that explains itself.
    throw new LlmError('模型接口没有返回 choices', 'bad_output', raw.slice(0, 300));
  }

  const message = (choices[0] as { message?: { content?: unknown; refusal?: unknown } }).message;
  if (typeof message?.refusal === 'string' && message.refusal.length > 0) {
    throw new LlmError('模型拒绝了这次请求', 'bad_output', message.refusal.slice(0, 300));
  }
  return typeof message?.content === 'string' ? message.content : '';
}

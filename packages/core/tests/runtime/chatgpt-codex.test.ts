import { describe, expect, test } from 'bun:test';
import { chatGptCodexProvider, collect } from '../../src/runtime/chatgpt-codex';
import { firstMessage } from '../../src/runtime/http-llm';
import { LlmError } from '../../src/llm/types';

/** An SSE frame as the backend actually sends them. */
const frame = (event: Record<string, unknown>): string => `data: ${JSON.stringify(event)}\n\n`;

const delta = (text: string): string =>
  frame({ type: 'response.output_text.delta', delta: text });

describe('collect', () => {
  /**
   * The finding this function exists for: `response.completed` arrives with an
   * empty `output` on this backend, so reading only the final event returns
   * nothing while the usage figures say tokens were produced. The text is in
   * the deltas.
   */
  test('builds the text from the deltas, not from response.completed', () => {
    const sse = [
      frame({ type: 'response.created' }),
      delta('{"fruit":'),
      delta('"apple"}'),
      frame({ type: 'response.completed', response: { output: [], usage: { output_tokens: 16 } } }),
    ].join('');

    expect(collect(sse)).toBe('{"fruit":"apple"}');
  });

  test('falls back to the done event when no deltas arrived', () => {
    const sse = [
      frame({ type: 'response.output_text.done', text: '{"ok":true}' }),
      frame({ type: 'response.completed', response: { output: [] } }),
    ].join('');

    expect(collect(sse)).toBe('{"ok":true}');
  });

  test('the done event does not duplicate text the deltas already carried', () => {
    const sse = [
      delta('{"ok":'),
      delta('true}'),
      frame({ type: 'response.output_text.done', text: '{"ok":true}' }),
    ].join('');

    expect(collect(sse)).toBe('{"ok":true}');
  });

  test('a failed response is an error, not an empty answer', () => {
    const sse = [
      delta('partial'),
      frame({ type: 'response.failed', response: { error: { message: 'boom' } } }),
    ].join('');

    expect(() => collect(sse)).toThrow(LlmError);
    expect(() => collect(sse)).toThrow(/未能完成/);
  });

  test('an incomplete response is too — a truncated deck is worse than a failure', () => {
    const sse = [delta('{"half"'), frame({ type: 'response.incomplete', response: {} })].join('');
    expect(() => collect(sse)).toThrow(LlmError);
  });

  test('a stream with no text at all reports it rather than returning empty', () => {
    expect(() => collect(frame({ type: 'response.completed', response: {} }))).toThrow(/未返回内容/);
  });

  /** A partial frame at the tail is ordinary; the deltas that parsed still stand. */
  test('a truncated frame does not lose the text before it', () => {
    expect(collect(`${delta('{"ok":true}')}data: {"type":"response.out`)).toBe('{"ok":true}');
  });

  test('[DONE] and blank lines are ignored', () => {
    expect(collect(`${delta('x')}\ndata: [DONE]\n\ndata:   \n\n`)).toBe('x');
  });
});

describe('firstMessage', () => {
  const reply = (message: Record<string, unknown>): string =>
    JSON.stringify({ choices: [{ message }] });

  test('returns the assistant content', () => {
    expect(firstMessage(reply({ content: '{"ok":true}' }))).toBe('{"ok":true}');
  });

  /**
   * A refusal comes back shaped like a success. Reporting it as "no content"
   * would throw away the one field that says what actually happened.
   */
  test('a refusal is surfaced with its reason', () => {
    expect(() => firstMessage(reply({ refusal: 'I cannot help with that' })))
      .toThrow(/拒绝/);
  });

  test('a non-JSON body says so instead of failing further down', () => {
    expect(() => firstMessage('<html>502 Bad Gateway</html>')).toThrow(/不是 JSON/);
  });

  test('a reply with no choices is an error, not an empty string', () => {
    expect(() => firstMessage(JSON.stringify({ error: { message: 'nope' } }))).toThrow(/choices/);
  });
});

describe('expired tokens', () => {
  const ok = (text: string): Response =>
    new Response(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n\n`, { status: 200 });

  /**
   * A book is near a hundred calls, so a stored token expiring mid-run is the
   * ordinary case, not the edge one. Failing every station still queued behind
   * it would throw away a whole generation for a token that renews in one call.
   */
  test('a 401 renews once and the call succeeds', async () => {
    const sent: string[] = [];
    let calls = 0;
    const provider = chatGptCodexProvider({
      accessToken: 'stale', accountId: 'acc', model: 'm',
      refresh: async () => 'fresh',
      fetch: (async (_url: string, init: RequestInit) => {
        sent.push((init.headers as Record<string, string>).authorization!);
        calls += 1;
        return calls === 1 ? new Response('nope', { status: 401 }) : ok('{"ok":true}');
      }) as unknown as typeof fetch,
    });

    expect(await provider.complete({ prompt: 'x' })).toBe('{"ok":true}');
    expect(sent).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  test('the renewed token is reused, not re-fetched per call', async () => {
    let refreshes = 0;
    let calls = 0;
    const provider = chatGptCodexProvider({
      accessToken: 'stale', accountId: 'acc', model: 'm',
      refresh: async () => { refreshes += 1; return 'fresh'; },
      fetch: (async () => {
        calls += 1;
        return calls === 1 ? new Response('nope', { status: 401 }) : ok('{"ok":true}');
      }) as unknown as typeof fetch,
    });

    await provider.complete({ prompt: 'a' });
    await provider.complete({ prompt: 'b' });
    expect(refreshes).toBe(1);
  });

  test('a refresh that fails reports it as an expired login, not a mystery', async () => {
    const provider = chatGptCodexProvider({
      accessToken: 'stale', accountId: 'acc', model: 'm',
      refresh: async () => undefined,
      fetch: (async () => new Response('nope', { status: 401 })) as unknown as typeof fetch,
    });

    expect(provider.complete({ prompt: 'x' })).rejects.toThrow(/登录已过期/);
  });

  test('without a refresh function a 401 is not retried', async () => {
    let calls = 0;
    const provider = chatGptCodexProvider({
      accessToken: 'stale', accountId: 'acc', model: 'm',
      fetch: (async () => { calls += 1; return new Response('nope', { status: 401 }); }) as unknown as typeof fetch,
    });

    await provider.complete({ prompt: 'x' }).catch(() => undefined);
    expect(calls).toBe(1);
  });
});

import { describe, expect, test } from 'bun:test';
import { DEFAULT_SHELL_SETTINGS } from '../../../src/shared/settings';
import { resolveChatModel, ChatModelError } from '../../../src/main/companion/model';

describe('resolveChatModel', () => {
  const jwt = (expiresAtSeconds: number): string =>
    `header.${Buffer.from(JSON.stringify({ exp: expiresAtSeconds })).toString('base64url')}.signature`;

  test('uses the existing Codex OAuth login without moving its credential', async () => {
    const resolved = await resolveChatModel(DEFAULT_SHELL_SETTINGS, {
      readLogin: async () => ({
        kind: 'oauth', accessToken: 'test-token', accountId: 'acct', model: 'gpt-5.6-sol',
      }),
    });

    expect(resolved.model.provider).toBe('openai-codex');
    expect(resolved.model.id).toBe('gpt-5.6-sol');
    expect(await resolved.getApiKey('openai-codex')).toBe('test-token');
  });

  test('`inherit` follows the generation provider', async () => {
    const resolved = await resolveChatModel({
      ...DEFAULT_SHELL_SETTINGS,
      generationProvider: 'anthropic',
      chatProvider: 'inherit',
      providers: { anthropic: { apiKey: 'secret', baseUrl: '', model: 'claude-haiku-4-5' } },
    });

    expect(resolved.model.provider).toBe('anthropic');
    expect(resolved.model.id).toBe('claude-haiku-4-5');
    expect(await resolved.getApiKey('anthropic')).toBe('secret');
  });

  test('a custom endpoint carries its own base URL', async () => {
    const resolved = await resolveChatModel({
      ...DEFAULT_SHELL_SETTINGS,
      generationProvider: 'custom',
      providers: { custom: { apiKey: 'secret', baseUrl: 'https://example.com/v1', model: 'custom-chat' } },
    });

    expect(resolved.model.id).toBe('custom-chat');
    expect(resolved.model.baseUrl).toBe('https://example.com/v1');
    expect(await resolved.getApiKey('custom')).toBe('secret');
  });

  test.each([
    { id: 'anthropic' as const, model: 'claude-haiku-4-5', api: 'anthropic-messages' },
    { id: 'deepseek' as const, model: 'deepseek-v4-pro', api: 'openai-completions' },
    { id: 'minimax' as const, model: 'MiniMax-M2.7', api: 'anthropic-messages' },
    { id: 'minimax-cn' as const, model: 'MiniMax-M2.7', api: 'anthropic-messages' },
  ])('resolves a $id Companion without changing generation', async ({ id, model, api }) => {
    const resolved = await resolveChatModel({
      ...DEFAULT_SHELL_SETTINGS,
      generationProvider: 'openai',
      chatProvider: id,
      providers: {
        openai: { apiKey: 'generation-only', baseUrl: '', model: '' },
        [id]: { apiKey: 'chat-only', baseUrl: '', model },
      },
    });
    expect(resolved.model.provider).toBe(id);
    expect(resolved.model.api).toBe(api);
    expect(resolved.model.id).toBe(model);
    expect(await resolved.getApiKey(id)).toBe('chat-only');
    // The generation key must not be reachable through the Companion's resolver
    expect(await resolved.getApiKey('openai')).toBeUndefined();
  });

  test('an empty model falls back to the provider default, not to nothing', async () => {
    const resolved = await resolveChatModel({
      ...DEFAULT_SHELL_SETTINGS,
      chatProvider: 'deepseek',
      providers: { deepseek: { apiKey: 'secret', baseUrl: '', model: '' } },
    });
    expect(resolved.model.id).toBe('deepseek-flash');
  });

  test('a missing Companion key fails before any model request', async () => {
    await expect(resolveChatModel({
      ...DEFAULT_SHELL_SETTINGS,
      chatProvider: 'anthropic',
      providers: { anthropic: { apiKey: '', baseUrl: '', model: 'claude-haiku-4-5' } },
    })).rejects.toMatchObject({ code: 'no_credential' });
  });

  test('an unavailable provider model fails explicitly', async () => {
    await expect(resolveChatModel({
      ...DEFAULT_SHELL_SETTINGS,
      chatProvider: 'deepseek',
      providers: { deepseek: { apiKey: 'secret', baseUrl: '', model: 'not-in-catalog' } },
    })).rejects.toMatchObject({ code: 'model_unavailable' });
  });

  test('reports missing credentials before a model request', async () => {
    await expect(resolveChatModel(DEFAULT_SHELL_SETTINGS, {
      readLogin: async () => ({ kind: 'none' }),
    })).rejects.toBeInstanceOf(ChatModelError);
  });

  test('refreshes an expired OAuth token before passing it to Pi', async () => {
    let current = jwt(100);
    let refreshes = 0;
    const resolved = await resolveChatModel(DEFAULT_SHELL_SETTINGS, {
      readLogin: async () => ({ kind: 'oauth', accessToken: current, refreshToken: 'refresh', accountId: 'acct', model: 'gpt-5.6-sol' }),
      refreshLogin: async () => { refreshes += 1; current = jwt(10_000); return current; },
      now: () => 1_000_000,
    });

    expect(await resolved.getApiKey('openai-codex')).toBe(current);
    expect(await resolved.getApiKey('openai-codex')).toBe(current);
    expect(refreshes).toBe(1);
  });

  test('does not refresh a valid OAuth token', async () => {
    const token = jwt(10_000);
    let refreshes = 0;
    const resolved = await resolveChatModel(DEFAULT_SHELL_SETTINGS, {
      readLogin: async () => ({ kind: 'oauth', accessToken: token, refreshToken: 'refresh', accountId: 'acct', model: 'gpt-5.6-sol' }),
      refreshLogin: async () => { refreshes += 1; return 'new-token'; },
      now: () => 1_000_000,
    });

    expect(await resolved.getApiKey('openai-codex')).toBe(token);
    expect(refreshes).toBe(0);
  });

  test('does not pass a known expired token when refresh fails', async () => {
    await expect(resolveChatModel(DEFAULT_SHELL_SETTINGS, {
      readLogin: async () => ({ kind: 'oauth', accessToken: jwt(100), refreshToken: 'refresh', accountId: 'acct', model: 'gpt-5.6-sol' }),
      refreshLogin: async () => undefined,
      now: () => 1_000_000,
    })).rejects.toBeInstanceOf(ChatModelError);
  });
});

import { describe, expect, test } from 'bun:test';
import { DEFAULT_SHELL_SETTINGS, type ShellSettingsValues } from '../../src/shared/settings';
import { resolveRoute, routeFor } from '../../src/main/route';

const oauth = { mode: 'oauth', apiKey: 'token' } as const;
const settings = (over: Partial<ShellSettingsValues>): ShellSettingsValues => ({ ...DEFAULT_SHELL_SETTINGS, ...over });

describe('routeFor', () => {
  test('Codex is available exactly when a codex login is', () => {
    expect(routeFor(DEFAULT_SHELL_SETTINGS, 'openai-codex', {}, undefined)).toBeUndefined();
    expect(routeFor(DEFAULT_SHELL_SETTINGS, 'openai-codex', {}, oauth))
      .toMatchObject({ id: 'openai-codex', apiKey: 'token', model: 'gpt-5.6-sol', codex: oauth });
  });

  test('a vendor needs a key, read through `$NAME` when the field holds one', () => {
    expect(routeFor(DEFAULT_SHELL_SETTINGS, 'openai', {}, undefined)).toBeUndefined();
    expect(routeFor(DEFAULT_SHELL_SETTINGS, 'openai', { OPENAI_API_KEY: 'sk' }, undefined))
      .toMatchObject({ id: 'openai', apiKey: 'sk' });
  });

  test('a custom endpoint needs its address, not a key', () => {
    const s = settings({ providers: { custom: { apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'm' } } });
    expect(routeFor(s, 'custom', {}, undefined)).toMatchObject({ baseUrl: 'http://localhost:8080/v1', model: 'm' });
  });
});

describe('resolveRoute', () => {
  test('the default wins when it has credentials', () => {
    const s = settings({
      generationProvider: 'openai-codex',
      providers: { deepseek: { apiKey: 'sk', baseUrl: '', model: '' } },
    });
    expect(resolveRoute(s, {}, oauth)?.id).toBe('openai-codex');
  });

  // The default was set to OpenAI with no key: DeepSeek, which had one, should answer
  test('a default without credentials falls to the first available provider by name', () => {
    const s = settings({
      generationProvider: 'openai',
      providers: { deepseek: { apiKey: 'sk', baseUrl: '', model: '' } },
    });
    expect(resolveRoute(s, {}, oauth)?.id).toBe('deepseek');
  });

  test('nothing configured anywhere resolves to nothing, not to a silent fallback', () => {
    expect(resolveRoute(DEFAULT_SHELL_SETTINGS, {}, undefined)).toBeUndefined();
  });
});

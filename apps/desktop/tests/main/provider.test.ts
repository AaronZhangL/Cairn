import { describe, expect, test } from 'bun:test';
import { DEFAULT_SHELL_SETTINGS } from '../../src/shared/settings';
import { resolveProvider } from '../../src/main/provider';

describe('resolveProvider', () => {
  /**
   * A half-typed key is not an error, so the fallback must say it is not ready.
   * Claiming readiness here would move the failure to the middle of a run, after
   * the reader has already chosen a budget and waited.
   */
  test('nothing configured falls back and reports itself not ready', async () => {
    const { provider, status } = await resolveProvider(DEFAULT_SHELL_SETTINGS);
    expect(status).toEqual({ provider: 'codex-cli', ready: false, detail: 'no-api-key' });
    expect(provider.name).toBe('codex-cli');
  });

  test('a configured provider reports the model it will actually call', async () => {
    const { provider, status } = await resolveProvider({
      ...DEFAULT_SHELL_SETTINGS,
      generationProvider: 'anthropic',
      providers: { anthropic: { apiKey: 'secret', baseUrl: '', model: 'claude-haiku-4-5' } },
    });
    expect(status).toEqual({ provider: 'anthropic', ready: true, detail: 'claude-haiku-4-5' });
    expect(provider.name).toBe('pi:anthropic');
  });

  test('an empty model resolves to the provider default rather than to nothing', async () => {
    const { status } = await resolveProvider({
      ...DEFAULT_SHELL_SETTINGS,
      generationProvider: 'deepseek',
      providers: { deepseek: { apiKey: 'secret', baseUrl: '', model: '' } },
    });
    expect(status.detail).toBe('deepseek-flash');
  });

  /** A local server needs no key, so an endpoint alone counts as configured. */
  test('an endpoint without a key still counts as configured', async () => {
    const { status } = await resolveProvider({
      ...DEFAULT_SHELL_SETTINGS,
      generationProvider: 'custom',
      providers: { custom: { apiKey: '', baseUrl: 'http://localhost:8080/v1', model: 'local' } },
    });
    expect(status).toEqual({ provider: 'custom', ready: true, detail: 'local' });
  });

  test('a key without an endpoint is enough for a known provider', async () => {
    const { status } = await resolveProvider({
      ...DEFAULT_SHELL_SETTINGS,
      generationProvider: 'openai',
      providers: { openai: { apiKey: 'secret', baseUrl: '', model: '' } },
    });
    expect(status.ready).toBe(true);
    expect(status.detail).toBe('gpt-5.4-mini');
  });

  /** Concurrency and overhead drive the map batch size and the scheduler. */
  test('the provider carries the numbers the pipeline schedules on', async () => {
    const { provider } = await resolveProvider({
      ...DEFAULT_SHELL_SETTINGS,
      providers: { openai: { apiKey: 'secret', baseUrl: '', model: '' } },
    });
    expect(provider.suggestedConcurrency).toBeGreaterThan(0);
    expect(provider.overheadTokens).toBeGreaterThan(0);
  });
});

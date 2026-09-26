import { describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCodexCredentials } from '../../src/runtime/codex-credentials';

async function codexDir(auth?: unknown, config?: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cairn-codex-'));
  if (auth !== undefined) await writeFile(join(dir, 'auth.json'), JSON.stringify(auth));
  if (config !== undefined) await writeFile(join(dir, 'config.toml'), config);
  return dir;
}

describe('readCodexCredentials', () => {
  test('nothing on disk means no credentials', async () => {
    expect(await readCodexCredentials(await codexDir())).toBeUndefined();
  });

  test('a ChatGPT login is used as an OAuth token', async () => {
    const dir = await codexDir({ tokens: { access_token: 'token' } });
    expect(await readCodexCredentials(dir)).toEqual({ mode: 'oauth', apiKey: 'token' });
  });

  // The same order as llm-space: the signed-in account first
  test('the OAuth token wins over an API key', async () => {
    const dir = await codexDir({ OPENAI_API_KEY: 'sk', tokens: { access_token: 'token' } });
    expect(await readCodexCredentials(dir)).toEqual({ mode: 'oauth', apiKey: 'token' });
  });

  test('an API key takes the active model provider’s endpoint and wire API', async () => {
    const dir = await codexDir({ OPENAI_API_KEY: 'sk' }, [
      'model_provider = "proxy"',
      '[model_providers.other]',
      'base_url = "https://other.example/v1"',
      '[model_providers.proxy]',
      'base_url = "https://proxy.example/v1"',
      'wire_api = "completions"',
    ].join('\n'));
    expect(await readCodexCredentials(dir)).toEqual({
      mode: 'apiKey', apiKey: 'sk', api: 'openai-completions', baseUrl: 'https://proxy.example/v1',
    });
  });

  test('an API key with no configured endpoint speaks the Responses API', async () => {
    const dir = await codexDir({ OPENAI_API_KEY: 'sk' });
    expect(await readCodexCredentials(dir)).toEqual({
      mode: 'apiKey', apiKey: 'sk', api: 'openai-responses', baseUrl: '',
    });
  });

  test('an unreadable auth file means no credentials', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'cairn-codex-'));
    await writeFile(join(dir, 'auth.json'), 'not json');
    expect(await readCodexCredentials(dir)).toBeUndefined();
  });
});

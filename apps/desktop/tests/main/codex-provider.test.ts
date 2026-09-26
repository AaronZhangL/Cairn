import { describe, expect, test } from 'bun:test';
import { codexCredentials, codexRegistry } from '../../src/main/codex-provider';

const jwt = (expiresAtSeconds: number): string =>
  `header.${Buffer.from(JSON.stringify({ exp: expiresAtSeconds })).toString('base64url')}.signature`;

describe('codexCredentials', () => {
  test('a valid token is used as it is', async () => {
    let refreshes = 0;
    const token = jwt(10_000);
    const read = await codexCredentials(async () => ({ mode: 'oauth', apiKey: token }),
      async () => { refreshes += 1; return 'new'; }, () => 1_000_000);
    expect(read).toEqual({ mode: 'oauth', apiKey: token });
    expect(refreshes).toBe(0);
  });

  test('an expired token is renewed before it is used', async () => {
    const renewed = jwt(10_000);
    const read = await codexCredentials(async () => ({ mode: 'oauth', apiKey: jwt(100) }),
      async () => renewed, () => 1_000_000);
    expect(read).toEqual({ mode: 'oauth', apiKey: renewed });
  });

  test('a token that cannot be renewed is not passed on', async () => {
    expect(await codexCredentials(async () => ({ mode: 'oauth', apiKey: jwt(100) }),
      async () => undefined, () => 1_000_000)).toBeUndefined();
  });
});

describe('codexRegistry', () => {
  test('a ChatGPT login talks to the Codex backend', () => {
    const built = codexRegistry('gpt-5.6-sol', { mode: 'oauth', apiKey: 't' });
    expect(built?.model).toMatchObject({ provider: 'openai-codex', api: 'openai-codex-responses' });
  });

  test('an API key takes the wire API and endpoint `config.toml` names', () => {
    const built = codexRegistry('gpt-5.6-sol', {
      mode: 'apiKey', apiKey: 'sk', api: 'openai-completions', baseUrl: 'https://proxy.example/v1',
    });
    expect(built?.model).toMatchObject({ api: 'openai-completions', baseUrl: 'https://proxy.example/v1' });
  });

  test('a model the catalog does not list is unavailable', () => {
    expect(codexRegistry('nope', { mode: 'oauth', apiKey: 't' })).toBeUndefined();
  });
});

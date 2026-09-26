import { CairnError } from '@cairn/core/errors';

const GATEWAY = 'https://i.weread.qq.com/api/agent/gateway';
/** The gateway requires the skill version on every call; this is the one the replies were read against. */
const SKILL_VERSION = '1.0.4';
const TIMEOUT_MS = 8_000;

export type WereadCall = (api: string, params?: Readonly<Record<string, unknown>>) => Promise<unknown>;

export function wereadClient(key: string, fetcher: typeof fetch = fetch): WereadCall {
  return async (api, params = {}) => {
    const response = await fetcher(GATEWAY, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      // Parameters sit beside `api_name`; nested under `params` the gateway silently drops them
      body: JSON.stringify({ ...params, api_name: api, skill_version: SKILL_VERSION }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new CairnError('weread_failed', { status: response.status }, api);
    const body: unknown = await response.json();
    const errcode = (body as { errcode?: unknown } | null)?.errcode;
    if (typeof errcode === 'number' && errcode !== 0) {
      throw new CairnError('weread_failed', { status: errcode }, api);
    }
    return body;
  };
}

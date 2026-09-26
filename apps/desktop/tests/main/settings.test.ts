import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SHELL_SETTINGS } from '../../src/shared/settings';
import { createSettingsStore } from '../../src/main/settings-store';
import { effectiveSearchKey, effectiveWereadKey } from '../../src/main/settings';

const dir = await mkdtemp(join(tmpdir(), 'cairn-settings-'));
const { read: readSettings, write: writeSettings } = createSettingsStore(dir);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

test('persists provider profiles and keys, and an empty field clears one', async () => {
  await writeSettings({
    generationProvider: 'openai',
    providers: { openai: { apiKey: 'secret-model', baseUrl: 'https://example.test/v1', model: 'gpt-5.4-mini' } },
    tavilyKey: 'secret-search',
  });
  expect((await readSettings()).providers.openai?.apiKey).toBe('secret-model');
  expect((await readSettings()).tavilyKey).toBe('secret-search');
  expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).generationProvider).toBe('openai');

  await writeSettings({ providers: { openai: { apiKey: '', baseUrl: '', model: '' } }, tavilyKey: '' });
  expect((await readSettings()).providers.openai?.apiKey).toBe('');
  expect((await readSettings()).tavilyKey).toBe('');
});

/**
 * The reason profiles are keyed by provider rather than by role. The old shape
 * had one key per role, so switching vendors had to drop it; here editing one
 * provider must leave every other provider's key exactly where it was.
 */
test('editing one provider leaves the others’ keys untouched', async () => {
  await writeSettings({
    providers: {
      openai: { apiKey: 'secret-openai', baseUrl: '', model: '' },
      anthropic: { apiKey: 'secret-anthropic', baseUrl: '', model: '' },
    },
  });


  // A patch naming only OpenAI, as the panel sends when that field is edited
  await writeSettings({ providers: { openai: { apiKey: 'replaced', baseUrl: '', model: '' } } });

  const stored = await readSettings();
  expect(stored.providers.openai?.apiKey).toBe('replaced');
  expect(stored.providers.anthropic?.apiKey).toBe('secret-anthropic');
});

test('the Companion provider keeps its own key when generation changes', async () => {
  await writeSettings({
    chatProvider: 'anthropic',
    providers: { anthropic: { apiKey: 'secret-companion', baseUrl: '', model: 'claude-haiku-4-5' } },
  });

  await writeSettings({ trace: true, generationProvider: 'openai' });
  expect((await readSettings()).providers.anthropic)
    .toEqual({ apiKey: 'secret-companion', baseUrl: '', model: 'claude-haiku-4-5' });
  expect((await readSettings()).chatProvider).toBe('anthropic');
});

test('an existing environment Tavily key keeps Tavily as the search provider', async () => {
  const legacyDir = await mkdtemp(join(tmpdir(), 'cairn-legacy-settings-'));
  try {
    const legacy = createSettingsStore(legacyDir, 'old-env-key');
    expect((await legacy.read()).searchProvider).toBe('tavily');
    await legacy.write({ searchProvider: 'firecrawl' });
    expect((await legacy.read()).searchProvider).toBe('firecrawl');
  } finally {
    await rm(legacyDir, { recursive: true, force: true });
  }
});

test('a key field is a key, a $NAME to read, or empty for none', () => {
  const env = { BRAVE_SEARCH_API_KEY: 'env-brave', FIRECRAWL_API_KEY: 'env-fire', TAVILY_API_KEY: 'env-tavily', MINE: 'mine' };
  const settings = { ...DEFAULT_SHELL_SETTINGS, braveKey: 'saved-brave', tavilyKey: '$MINE' };
  expect(effectiveSearchKey({ ...settings, searchProvider: 'brave' }, env)).toBe('saved-brave');
  expect(effectiveSearchKey({ ...settings, searchProvider: 'firecrawl' }, env)).toBe('env-fire');
  expect(effectiveSearchKey({ ...settings, searchProvider: 'tavily' }, env)).toBe('mine');
  expect(effectiveSearchKey({ ...settings, searchProvider: 'firecrawl' }, {})).toBeUndefined();
  // Cleared means no key, not "fall back to the environment" as it once did
  expect(effectiveSearchKey({ ...settings, searchProvider: 'firecrawl', firecrawlKey: '' }, env)).toBeUndefined();
});

test('a $NAME in the WeChat Reading field reads the environment', async () => {
  await writeSettings({ wereadKey: '$WEREAD_API_KEY' });
  expect(effectiveWereadKey(await readSettings(), { WEREAD_API_KEY: 'from-env' })).toBe('from-env');
  await writeSettings({ wereadKey: 'typed' });
  expect(effectiveWereadKey(await readSettings(), { WEREAD_API_KEY: 'from-env' })).toBe('typed');
});

/** Before `$NAME`, an empty field meant "read the environment"; such a file must keep doing so. */
test('a file from before $NAME keeps reading the environment; one written since keeps its empty', async () => {
  const legacyDir = await mkdtemp(join(tmpdir(), 'cairn-legacy-'));
  try {
    await writeFile(join(legacyDir, 'settings.json'), JSON.stringify({ searchProvider: 'tavily', tavilyKey: '', braveKey: 'kept' }));
    const legacy = createSettingsStore(legacyDir);
    expect((await legacy.read()).tavilyKey).toBe('$TAVILY_API_KEY');
    expect((await legacy.read()).braveKey).toBe('kept');

    await legacy.write({ tavilyKey: '' });
    expect((await createSettingsStore(legacyDir).read()).tavilyKey).toBe('');
  } finally {
    await rm(legacyDir, { recursive: true, force: true });
  }
});

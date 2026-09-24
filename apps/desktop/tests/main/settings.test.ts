import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_SHELL_SETTINGS, REDACTED_SECRET } from '../../src/shared/settings';
import { createSettingsStore } from '../../src/main/settings-store';
import { effectiveSearchKey } from '../../src/main/settings';

const dir = await mkdtemp(join(tmpdir(), 'cairn-settings-'));
const { read: readSettings, readForRenderer: readSettingsForRenderer, write: writeSettings } = createSettingsStore(dir);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

test('persists provider profiles and secrets, but never returns secrets to the renderer', async () => {
  await writeSettings({
    generationProvider: 'openai',
    providers: { openai: { apiKey: 'secret-model', baseUrl: 'https://example.test/v1', model: 'gpt-5.4-mini' } },
    tavilyKey: 'secret-search',
    braveKey: 'secret-brave',
    firecrawlKey: 'secret-firecrawl',
  });
  const visible = await readSettingsForRenderer();
  expect(visible.providers.openai?.apiKey).toBe(REDACTED_SECRET);
  expect(visible.providers.openai?.model).toBe('gpt-5.4-mini');
  expect(visible.tavilyKey).toBe(REDACTED_SECRET);
  expect(visible.braveKey).toBe(REDACTED_SECRET);
  expect(visible.firecrawlKey).toBe(REDACTED_SECRET);
  expect(JSON.stringify(visible)).not.toContain('secret-');
  expect((await readSettings()).providers.openai?.apiKey).toBe('secret-model');
  expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).generationProvider).toBe('openai');
});

test('a redacted marker preserves a secret across unrelated edits; empty clears it', async () => {
  const visible = await readSettingsForRenderer();
  await writeSettings({
    providers: { openai: { ...visible.providers.openai!, model: 'gpt-5.4-nano' } },
    tavilyKey: REDACTED_SECRET, braveKey: REDACTED_SECRET, firecrawlKey: REDACTED_SECRET,
  });
  expect((await readSettings()).providers.openai?.apiKey).toBe('secret-model');
  expect((await readSettings()).providers.openai?.model).toBe('gpt-5.4-nano');
  expect((await readSettings()).tavilyKey).toBe('secret-search');
  expect((await readSettings()).braveKey).toBe('secret-brave');
  expect((await readSettings()).firecrawlKey).toBe('secret-firecrawl');

  await writeSettings({
    providers: { openai: { ...visible.providers.openai!, apiKey: '' } },
    tavilyKey: '', braveKey: '', firecrawlKey: '',
  });
  expect((await readSettings()).providers.openai?.apiKey).toBe('');
  expect((await readSettings()).tavilyKey).toBe('');
  expect((await readSettings()).braveKey).toBe('');
  expect((await readSettings()).firecrawlKey).toBe('');
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

  const visible = await readSettingsForRenderer();
  expect(visible.providers.anthropic?.apiKey).toBe(REDACTED_SECRET);

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
  const visible = await readSettingsForRenderer();
  expect(visible.providers.anthropic?.apiKey).toBe(REDACTED_SECRET);
  expect(JSON.stringify(visible)).not.toContain('secret-companion');

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

test('selected provider uses only its own saved or environment key', () => {
  const env = { BRAVE_SEARCH_API_KEY: 'env-brave', FIRECRAWL_API_KEY: 'env-fire', TAVILY_API_KEY: 'env-tavily' };
  const settings = { ...DEFAULT_SHELL_SETTINGS, braveKey: 'saved-brave', firecrawlKey: '' };
  expect(effectiveSearchKey({ ...settings, searchProvider: 'brave' }, env)).toBe('saved-brave');
  expect(effectiveSearchKey({ ...settings, searchProvider: 'firecrawl' }, env)).toBe('env-fire');
  expect(effectiveSearchKey({ ...settings, searchProvider: 'tavily' }, env)).toBe('env-tavily');
  expect(effectiveSearchKey({ ...settings, searchProvider: 'firecrawl' }, {})).toBeUndefined();
});

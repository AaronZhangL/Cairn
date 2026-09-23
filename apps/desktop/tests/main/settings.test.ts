import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REDACTED_SECRET } from '../../src/shared/settings';
import { createSettingsStore } from '../../src/main/settings-store';

const dir = await mkdtemp(join(tmpdir(), 'cairn-settings-'));
const { read: readSettings, readForRenderer: readSettingsForRenderer, write: writeSettings } = createSettingsStore(dir);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

test('persists source selection and secrets, but never returns secrets to the renderer', async () => {
  await writeSettings({
    model: { source: 'key', apiKey: 'secret-model', baseUrl: 'https://example.test/v1', model: 'm' },
    tavilyKey: 'secret-search',
  });
  const visible = await readSettingsForRenderer();
  expect(visible.model.source).toBe('key');
  expect(visible.model.apiKey).toBe(REDACTED_SECRET);
  expect(visible.tavilyKey).toBe(REDACTED_SECRET);
  expect(JSON.stringify(visible)).not.toContain('secret-');
  expect((await readSettings()).model.apiKey).toBe('secret-model');
  expect(JSON.parse(await readFile(join(dir, 'settings.json'), 'utf8')).model.source).toBe('key');
});

test('a redacted marker preserves a secret across unrelated edits; empty clears it', async () => {
  const visible = await readSettingsForRenderer();
  await writeSettings({ model: { ...visible.model, source: 'codex' }, tavilyKey: REDACTED_SECRET });
  expect((await readSettings()).model.apiKey).toBe('secret-model');
  expect((await readSettings()).tavilyKey).toBe('secret-search');

  await writeSettings({ model: { ...visible.model, apiKey: '' }, tavilyKey: '' });
  expect((await readSettings()).model.apiKey).toBe('');
  expect((await readSettings()).tavilyKey).toBe('');
});

test('the Companion key stays in the main process and survives unrelated edits', async () => {
  await writeSettings({ chatModel: { source: 'anthropic', apiKey: 'secret-companion', model: 'claude-sonnet-4-6' } });
  const visible = await readSettingsForRenderer();
  expect(visible.chatModel.apiKey).toBe(REDACTED_SECRET);
  expect(JSON.stringify(visible)).not.toContain('secret-companion');
  await writeSettings({ trace: true, chatModel: visible.chatModel });
  expect((await readSettings()).chatModel).toEqual({ source: 'anthropic', apiKey: 'secret-companion', model: 'claude-sonnet-4-6' });
});

test('changing Companion provider cannot reuse the prior provider key', async () => {
  const visible = await readSettingsForRenderer();
  await writeSettings({ chatModel: { ...visible.chatModel, source: 'deepseek' } });
  expect((await readSettings()).chatModel).toEqual({ source: 'deepseek', apiKey: '', model: 'claude-sonnet-4-6' });
});

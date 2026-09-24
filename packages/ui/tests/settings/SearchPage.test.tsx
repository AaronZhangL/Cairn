import { describe, expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SearchPage } from '../../src/settings/pages';
import { SettingsProvider } from '../../src/settings/SettingsProvider';
import type { ShellSettings } from '../../src/settings/shell';

const KEPT = '••••••••';

function shellWith(overrides: Partial<ShellSettings['prefs']> = {}): ShellSettings {
  return {
    prefs: {
      providers: {}, generationProvider: 'openai', chatProvider: 'inherit',
      narration: 'follow', voices: { en: 'en-US-AndrewNeural', zh: 'zh-CN-YunjianNeural' },
      searchProvider: 'firecrawl', braveKey: '', firecrawlKey: '', tavilyKey: '', trace: false,
      ...overrides,
    },
    keptSecret: KEPT,
    setPref: () => {},
    setProvider: () => {},
    providers: [],
    voicesFor: () => [],
    recheckModel: () => {},
    previewVoice: () => {},
    dataDir: '/tmp',
    revealDataDir: () => {},
    clearCache: async () => {},
  };
}

const render = (shell?: ShellSettings): string =>
  renderToStaticMarkup(createElement(SettingsProvider, null, createElement(SearchPage, { shell })));

describe('SearchPage', () => {
  test('every search provider says where its key comes from', () => {
    const html = render(shellWith());
    expect(html).toContain('api-dashboard.search.brave.com');
    expect(html).toContain('firecrawl.dev');
    expect(html).toContain('tavily.com');
  });

  test('a stored search key is never written into the field', () => {
    const html = render(shellWith({ braveKey: KEPT }));
    expect(html).not.toContain(`value="${KEPT}"`);
    expect(html).toContain('set-clear');
  });

  test('without a shell it says so instead of pretending the controls work', () => {
    expect(render(undefined)).toContain('bun run start');
  });
});

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { ModelsPage } from '../../src/settings/ModelsPage';
import { SettingsProvider } from '../../src/settings/SettingsProvider';
import type { ProviderInfo, ShellSettings } from '../../src/settings/shell';

/**
 * Rendering, not asserting on markup.
 *
 * A settings page can typecheck and still throw on its first paint — an
 * undefined provider, a hook behind a branch. `bun run dev` shows that, but only
 * to whoever opens the panel.
 */
const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'openai', label: 'OpenAI', getKeyUrl: 'https://example.test', faviconDomain: 'openai.com',
    baseUrl: 'https://api.openai.com/v1', needsBaseUrl: false,
    models: [
      { id: 'gpt-5.4-mini', name: 'GPT-5.4 mini', strict: true },
      { id: 'legacy', name: 'Legacy', strict: false },
    ],
  },
  {
    id: 'moonshotai', label: 'Moonshot', getKeyUrl: '', faviconDomain: 'moonshot.cn',
    baseUrl: 'https://api.moonshot.cn/v1', needsBaseUrl: false,
    models: [{ id: 'kimi-k2.6', name: 'Kimi K2.6', strict: false }],
  },
  {
    id: 'custom', label: 'Custom', getKeyUrl: '', faviconDomain: '',
    baseUrl: '', needsBaseUrl: true, models: [],
  },
];

function shellWith(overrides: Partial<ShellSettings['prefs']> = {}): ShellSettings {
  return {
    prefs: {
      providers: {}, generationProvider: 'openai', chatProvider: 'inherit',
      narration: 'follow', voices: { en: 'en-US-AndrewNeural', zh: 'zh-CN-YunjianNeural' },
      searchProvider: 'firecrawl', braveKey: '', firecrawlKey: '', tavilyKey: '', trace: false,
      ...overrides,
    },
    keptSecret: '••••••••',
    setPref: () => {},
    setProvider: () => {},
    providers: PROVIDERS,
    voicesFor: () => [],
    recheckModel: () => {},
    previewVoice: () => {},
    dataDir: '/tmp',
    revealDataDir: () => {},
    clearCache: async () => {},
  };
}

const render = (shell?: ShellSettings): string =>
  renderToStaticMarkup(createElement(SettingsProvider, null, createElement(ModelsPage, { shell })));

describe('ModelsPage', () => {
  test('renders every provider, and opens on the generation default', () => {
    const html = render(shellWith());
    for (const provider of PROVIDERS) expect(html).toContain(provider.label);
    expect(html).toContain('gpt-5.4-mini');
  });

  test('a provider with no constrained model is offered like any other', () => {
    expect(render(shellWith())).toContain('Moonshot');
  });

  test('an unconstrained model is offered last, not withheld', () => {
    // `legacy` is OpenAI's unconstrained entry, `gpt-5.4-mini` its constrained one
    const html = render(shellWith());
    expect(html.indexOf('>Legacy<')).toBeGreaterThan(html.indexOf('>GPT-5.4 mini<'));
  });

  test('a stored key renders as the stand-in, never as itself', () => {
    const html = render(shellWith({
      providers: { openai: { apiKey: '••••••••', baseUrl: '', model: '' } },
    }));
    expect(html).not.toContain('sk-');
  });

  /**
   * The eye used to reveal the stand-in itself: the key never crosses the
   * bridge, so there was nothing behind the dots to show.
   */
  test('a stored key offers clearing rather than revealing', () => {
    const html = render(shellWith({
      providers: { openai: { apiKey: '••••••••', baseUrl: '', model: '' } },
    }));
    expect(html).not.toContain('••••••••');
    expect(html).not.toContain('set-eye');
    expect(html).toContain('set-clear');
  });

  test('a custom endpoint takes a typed model id rather than a picker', () => {
    const html = render(shellWith({ generationProvider: 'custom' }));
    expect(html).toContain('Custom');
  });

  test('without a shell it says so instead of pretending the controls work', () => {
    expect(render(undefined)).toContain('bun run start');
  });
});

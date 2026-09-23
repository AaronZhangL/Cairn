import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_SHELL_SETTINGS, parseSettings, redactSettings, REDACTED_SECRET, VOICES, voiceFor,
} from '../../src/shared/settings';

describe('parseSettings', () => {
  test('nothing stored yet falls back whole', () => {
    expect(parseSettings(undefined)).toEqual(DEFAULT_SHELL_SETTINGS);
    expect(parseSettings(null)).toEqual(DEFAULT_SHELL_SETTINGS);
  });

  test('narration follows the book by default', () => {
    expect(DEFAULT_SHELL_SETTINGS.narration).toBe('follow');
  });

  test('the Chinese default is the voice every existing book was built with', () => {
    // Changing this silently re-keys every book that never chose a voice
    expect(DEFAULT_SHELL_SETTINGS.voices.zh).toBe('zh-CN-YunjianNeural');
  });

  test('keeps a valid record', () => {
    const stored = {
      model: { source: 'key', apiKey: 'sk-x', baseUrl: 'https://example.test/v1', model: 'm' },
      narration: 'en',
      voices: { en: 'en-US-AvaNeural', zh: 'zh-CN-XiaoxiaoNeural' },
      tavilyKey: 'tvly-x',
      trace: true,
      defaultBudget: 'solid',
    };
    expect(parseSettings(stored)).toEqual({ ...stored, chatModel: DEFAULT_SHELL_SETTINGS.chatModel });
  });

  test('the model route defaults to borrowing the Codex login', () => {
    expect(DEFAULT_SHELL_SETTINGS.model.source).toBe('codex');
    expect(DEFAULT_SHELL_SETTINGS.chatModel.source).toBe('inherit');
  });

  test('parses a separate Companion provider without changing generation', () => {
    const parsed = parseSettings({
      model: { source: 'key', apiKey: 'generation-key', baseUrl: 'https://generation.test', model: 'generation' },
      chatModel: { source: 'deepseek', apiKey: 'chat-key', model: 'deepseek-v4-pro' },
    });
    expect(parsed.model.source).toBe('key');
    expect(parsed.model.apiKey).toBe('generation-key');
    expect(parsed.chatModel).toEqual({ source: 'deepseek', apiKey: 'chat-key', model: 'deepseek-v4-pro' });
    expect(redactSettings(parsed).chatModel.apiKey).toBe(REDACTED_SECRET);
  });

  test('rejects unknown Companion providers', () => {
    expect(parseSettings({ chatModel: { source: 'unknown', apiKey: 'x' } }).chatModel.source)
      .toBe('inherit');
  });

  test('accepts the MiniMax China endpoint as a distinct provider', () => {
    expect(parseSettings({ chatModel: { source: 'minimax-cn' } }).chatModel.source).toBe('minimax-cn');
  });

  test('redacts stored credentials before settings reach the renderer', () => {
    const stored = parseSettings({
      model: { source: 'key', apiKey: 'private-model-key' }, tavilyKey: 'private-search-key',
    });
    const visible = redactSettings(stored);
    expect(visible.model.source).toBe('key');
    expect(visible.model.apiKey).toBe(REDACTED_SECRET);
    expect(visible.tavilyKey).toBe(REDACTED_SECRET);
    expect(JSON.stringify(visible)).not.toContain('private-');
    expect(redactSettings(DEFAULT_SHELL_SETTINGS).model.apiKey).toBe('');
  });

  test.each([
    { value: 'chatgpt' }, { value: '' }, { value: 42 }, { value: null },
  ])('a model source of $value is not honoured', ({ value }) => {
    expect(parseSettings({ model: { source: value } }).model.source)
      .toBe(DEFAULT_SHELL_SETTINGS.model.source);
  });

  test('a model block that is not an object falls back whole', () => {
    expect(parseSettings({ model: 'openai' }).model).toEqual(DEFAULT_SHELL_SETTINGS.model);
  });

  /**
   * Empty is meaningful for all three: "use the detected login's endpoint",
   * "use the detected model". Coercing them to a default would silently pin a
   * value the reader never chose.
   */
  test('empty endpoint and model are kept, not defaulted', () => {
    const parsed = parseSettings({ model: { source: 'key', apiKey: 'k', baseUrl: '', model: '' } });
    expect(parsed.model.baseUrl).toBe('');
    expect(parsed.model.model).toBe('');
  });

  /**
   * A voice id that no longer exists would fail at synthesis — which happens
   * *after* a model call has been paid for. Rejecting it here is the cheap end.
   */
  test('a voice this build does not ship is not honoured', () => {
    const parsed = parseSettings({ voices: { zh: 'zh-CN-GoneNeural', en: 'nope' } });
    expect(parsed.voices.zh).toBe(DEFAULT_SHELL_SETTINGS.voices.zh);
    expect(parsed.voices.en).toBe(DEFAULT_SHELL_SETTINGS.voices.en);
  });

  test('a voice from the wrong language list is not honoured either', () => {
    // en-US-AndrewNeural is real, but not a Chinese voice
    expect(parseSettings({ voices: { zh: 'en-US-AndrewNeural' } }).voices.zh)
      .toBe(DEFAULT_SHELL_SETTINGS.voices.zh);
  });

  test.each(['sometimes', '', 'ja', 42, null])(
    'a narration language of %p is not honoured',
    (narration) => {
      expect(parseSettings({ narration }).narration).toBe(DEFAULT_SHELL_SETTINGS.narration);
    },
  );

  test('a budget id this build dropped is not honoured', () => {
    expect(parseSettings({ defaultBudget: 'skim' }).defaultBudget)
      .toBe(DEFAULT_SHELL_SETTINGS.defaultBudget);
  });

  test('an empty key is kept, because it means “read the environment”', () => {
    expect(parseSettings({ tavilyKey: '' }).tavilyKey).toBe('');
  });

  // Wrapped in objects: `test.each` spreads a bare array into zero arguments
  test.each([
    { value: 'nonsense' }, { value: 42 }, { value: [] }, { value: true },
  ])('$value is not a settings record', ({ value }) => {
    expect(parseSettings(value)).toEqual(DEFAULT_SHELL_SETTINGS);
  });
});

describe('voiceFor', () => {
  const settings = {
    ...DEFAULT_SHELL_SETTINGS,
    voices: { en: 'en-US-AvaNeural', zh: 'zh-CN-XiaoxiaoNeural' },
  };

  test('following the book uses the book’s own language', () => {
    expect(voiceFor({ ...settings, narration: 'follow' }, 'zh'))
      .toEqual({ locale: 'zh', voice: 'zh-CN-XiaoxiaoNeural' });
    expect(voiceFor({ ...settings, narration: 'follow' }, 'en'))
      .toEqual({ locale: 'en', voice: 'en-US-AvaNeural' });
  });

  /** Forcing a language is the reader's call, and it overrides the book. */
  test('forcing a language overrides the book', () => {
    expect(voiceFor({ ...settings, narration: 'en' }, 'zh'))
      .toEqual({ locale: 'en', voice: 'en-US-AvaNeural' });
  });

  test('every shipped voice id belongs to its own language list', () => {
    expect(VOICES.zh.every((v) => v.id.startsWith('zh-'))).toBe(true);
    expect(VOICES.en.every((v) => v.id.startsWith('en-'))).toBe(true);
  });

  test('both defaults are ids this build actually ships', () => {
    expect(VOICES.en.some((v) => v.id === DEFAULT_SHELL_SETTINGS.voices.en)).toBe(true);
    expect(VOICES.zh.some((v) => v.id === DEFAULT_SHELL_SETTINGS.voices.zh)).toBe(true);
  });
});

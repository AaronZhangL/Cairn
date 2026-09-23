/**
 * The settings the main process owns, and the voices it can speak with.
 *
 * Shared by both sides of the bridge, and deliberately free of React and of
 * `node:*` — the main process validates what it reads off disk with the same
 * code the player uses to type what it sends.
 *
 * The *renderer's* own settings (language, theme, text size, speed) are not
 * here: they never leave the webview, and `packages/ui/src/settings/prefs.ts`
 * holds them.
 */
import type { BudgetId } from '@cairn/core/pipeline/budget';
import { DEFAULT_VOICES } from '@cairn/core/pipeline/voice';

export const CONTENT_LOCALES = ['en', 'zh'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

/**
 * The language the *interface* is in.
 *
 * The same two values as `ContentLocale` today, and deliberately a separate
 * type anyway: one is a property of a book and the other is a choice the reader
 * made, and the moment they are the same type someone will pass one where the
 * other belongs. That is the bug this whole split exists to prevent.
 */
export type UiLocale = 'en' | 'zh';

/** `follow` reads a book in the language the book is written in. */
export type NarrationLanguage = 'follow' | ContentLocale;

export interface VoiceSpec {
  /** What edge-tts is invoked with. */
  readonly id: string;
  /** A proper noun — never translated. */
  readonly name: string;
  readonly gender: 'male' | 'female';
  readonly style: 'narration' | 'warm' | 'casual' | 'youth';
}

/**
 * A short, opinionated list rather than everything `edge-tts --list-voices`
 * prints: that is several hundred entries, most of them other languages, and a
 * picker nobody can get to the end of is not a choice.
 *
 * Every id below was checked against `edge-tts --list-voices`. A wrong one
 * fails loudly at synthesis rather than silently, and the engine row in the
 * settings panel is where that surfaces.
 */
export const VOICES: Readonly<Record<ContentLocale, readonly VoiceSpec[]>> = {
  en: [
    { id: 'en-US-AndrewNeural', name: 'Andrew', gender: 'male', style: 'narration' },
    { id: 'en-US-AvaNeural', name: 'Ava', gender: 'female', style: 'warm' },
    { id: 'en-US-BrianNeural', name: 'Brian', gender: 'male', style: 'casual' },
    { id: 'en-US-EmmaNeural', name: 'Emma', gender: 'female', style: 'casual' },
    { id: 'en-GB-RyanNeural', name: 'Ryan', gender: 'male', style: 'narration' },
  ],
  zh: [
    { id: 'zh-CN-YunjianNeural', name: '云健', gender: 'male', style: 'narration' },
    { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓', gender: 'female', style: 'warm' },
    { id: 'zh-CN-YunxiNeural', name: '云希', gender: 'male', style: 'youth' },
    { id: 'zh-CN-XiaoyiNeural', name: '晓伊', gender: 'female', style: 'casual' },
    { id: 'zh-CN-YunyangNeural', name: '云扬', gender: 'male', style: 'narration' },
  ],
};

/** Where the model comes from. */
export type ModelSource =
  /** Whatever `~/.codex` holds — an API key, or a ChatGPT login. */
  | 'codex'
  /** A key the reader typed in, against any OpenAI-compatible endpoint. */
  | 'key';

export interface ModelSettings {
  readonly source: ModelSource;
  readonly apiKey: string;
  /** Empty means the provider's own default. */
  readonly baseUrl: string;
  /** Empty means: whatever the detected login names. */
  readonly model: string;
}

export type ChatModelSource = 'inherit' | 'anthropic' | 'deepseek' | 'minimax' | 'minimax-cn';

export interface ChatModelSettings {
  readonly source: ChatModelSource;
  readonly apiKey: string;
  readonly model: string;
}

export interface ModelStatus {
  /** Which route is in force. */
  readonly provider: 'chatgpt-codex' | 'http' | 'codex-cli';
  /** False means generation will fail until the reader fixes something. */
  readonly ready: boolean;
  /** The endpoint, the model, or why it is not ready. Shown verbatim. */
  readonly detail: string;
}

export interface ShellSettingsValues {
  readonly model: ModelSettings;
  readonly chatModel: ChatModelSettings;
  readonly narration: NarrationLanguage;
  readonly voices: Readonly<Record<ContentLocale, string>>;
  readonly searchProvider: 'brave' | 'firecrawl' | 'tavily';
  readonly braveKey: string;
  readonly firecrawlKey: string;
  /** Empty means "read `TAVILY_API_KEY` from the environment instead". */
  readonly tavilyKey: string;
  readonly trace: boolean;
  readonly defaultBudget: BudgetId;
}

const BUDGET_IDS: readonly BudgetId[] = ['quick', 'brief', 'solid', 'full'];

export const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

/** A display-only stand-in; persisted credentials never cross the renderer bridge. */
export const REDACTED_SECRET = '••••••••';

export const DEFAULT_SHELL_SETTINGS: ShellSettingsValues = {
  // Borrowing the CLI's login is what makes this work with no setup at all on
  // the machine it was developed on. A distributed build is expected to change
  // this to `key`; see the note at the top of `runtime/chatgpt-codex.ts`.
  model: { source: 'codex', apiKey: '', baseUrl: '', model: '' },
  chatModel: { source: 'inherit', apiKey: '', model: '' },
  narration: 'follow',
  // From `pipeline/voice.ts`, not a second copy: the terminal path has no
  // settings file and falls back to those, and two lists would drift.
  voices: { en: DEFAULT_VOICES.en, zh: DEFAULT_VOICES.zh },
  searchProvider: 'firecrawl',
  braveKey: '',
  firecrawlKey: '',
  tavilyKey: '',
  trace: false,
  defaultBudget: 'brief',
};

function known(locale: ContentLocale, id: unknown): string | undefined {
  return typeof id === 'string' && VOICES[locale].some((v) => v.id === id) ? id : undefined;
}

/**
 * Validate a settings record read off disk.
 *
 * Untrusted for the same reason the renderer's is: an older build wrote it, and
 * a voice id that no longer exists would fail at synthesis — after a model call
 * has already been paid for.
 */
export function parseSettings(
  value: unknown,
  fallback: ShellSettingsValues = DEFAULT_SHELL_SETTINGS,
): ShellSettingsValues {
  if (typeof value !== 'object' || value === null) return fallback;
  const raw = value as Partial<Record<keyof ShellSettingsValues, unknown>>;
  const voices = (typeof raw.voices === 'object' && raw.voices !== null ? raw.voices : {}) as
    Partial<Record<ContentLocale, unknown>>;

  const narration = raw.narration;
  const model = (typeof raw.model === 'object' && raw.model !== null ? raw.model : {}) as
    Partial<Record<keyof ModelSettings, unknown>>;
  const chatModel = (typeof raw.chatModel === 'object' && raw.chatModel !== null ? raw.chatModel : {}) as
    Partial<Record<keyof ChatModelSettings, unknown>>;
  const chatSource = chatModel.source;

  return {
    model: {
      source: model.source === 'key' ? 'key' : fallback.model.source,
      apiKey: typeof model.apiKey === 'string' ? model.apiKey : fallback.model.apiKey,
      baseUrl: typeof model.baseUrl === 'string' ? model.baseUrl : fallback.model.baseUrl,
      model: typeof model.model === 'string' ? model.model : fallback.model.model,
    },
    chatModel: {
      source: chatSource === 'inherit' || chatSource === 'anthropic' || chatSource === 'deepseek' || chatSource === 'minimax' || chatSource === 'minimax-cn'
        ? chatSource : fallback.chatModel.source,
      apiKey: typeof chatModel.apiKey === 'string' ? chatModel.apiKey : fallback.chatModel.apiKey,
      model: typeof chatModel.model === 'string' ? chatModel.model : fallback.chatModel.model,
    },
    narration: narration === 'follow' || narration === 'en' || narration === 'zh'
      ? narration
      : fallback.narration,
    voices: {
      en: known('en', voices.en) ?? fallback.voices.en,
      zh: known('zh', voices.zh) ?? fallback.voices.zh,
    },
    searchProvider: raw.searchProvider === 'brave' || raw.searchProvider === 'firecrawl' || raw.searchProvider === 'tavily'
      ? raw.searchProvider : raw.searchProvider === 'keenable' ? 'firecrawl'
        : typeof raw.tavilyKey === 'string' && raw.tavilyKey.trim() ? 'tavily' : fallback.searchProvider,
    braveKey: typeof raw.braveKey === 'string' ? raw.braveKey : fallback.braveKey,
    firecrawlKey: typeof raw.firecrawlKey === 'string' ? raw.firecrawlKey : fallback.firecrawlKey,
    tavilyKey: typeof raw.tavilyKey === 'string' ? raw.tavilyKey : fallback.tavilyKey,
    trace: typeof raw.trace === 'boolean' ? raw.trace : fallback.trace,
    defaultBudget: BUDGET_IDS.includes(raw.defaultBudget as BudgetId)
      ? (raw.defaultBudget as BudgetId)
      : fallback.defaultBudget,
  };
}

export function redactSettings(settings: ShellSettingsValues): ShellSettingsValues {
  return {
    ...settings,
    model: {
      ...settings.model,
      apiKey: settings.model.apiKey ? REDACTED_SECRET : '',
    },
    chatModel: {
      ...settings.chatModel,
      apiKey: settings.chatModel.apiKey ? REDACTED_SECRET : '',
    },
    tavilyKey: settings.tavilyKey ? REDACTED_SECRET : '',
    braveKey: settings.braveKey ? REDACTED_SECRET : '',
    firecrawlKey: settings.firecrawlKey ? REDACTED_SECRET : '',
  };
}

/**
 * Which voice a book gets, decided once when it is built.
 *
 * `follow` is the default because a book read aloud in a language it was not
 * written in is noise — the narration script is generated in the book's own
 * language unless the reader overrode it, and the voice has to match the script,
 * not the interface.
 */
export function voiceFor(
  settings: ShellSettingsValues,
  bookLanguage: ContentLocale,
): { readonly locale: ContentLocale; readonly voice: string } {
  const locale = settings.narration === 'follow' ? bookLanguage : settings.narration;
  return { locale, voice: settings.voices[locale] };
}

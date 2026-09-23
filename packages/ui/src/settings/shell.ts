/**
 * The settings only the main process can hold, as the panel sees them.
 *
 * An interface rather than an import, for the same reason `LlmProvider` is one:
 * `packages/ui` must not know that a desktop shell or an RPC bridge exists.
 * `bun run dev` passes nothing here and the pages that need it say so instead
 * of pretending the controls work.
 */
import type { Locale } from '../i18n/locale';

/** Which language a book is read aloud in. `follow` uses the book's own. */
export type NarrationLanguage = 'follow' | Locale;

/** Mirrors `BudgetId` in `pipeline/budget.ts`. The ids are the contract. */
export const BUDGET_IDS = ['quick', 'brief', 'solid', 'full'] as const;
export type SettingsBudgetId = (typeof BUDGET_IDS)[number];

/** Where the model comes from. Mirrors `shared/settings.ts` in the desktop app. */
export type ModelSource = 'codex' | 'key';

export interface ModelSettings {
  readonly source: ModelSource;
  readonly apiKey: string;
  /** Empty means the provider's own default. */
  readonly baseUrl: string;
  /** Empty means: whatever the detected login names. */
  readonly model: string;
}

export interface ModelStatus {
  readonly provider: 'chatgpt-codex' | 'http' | 'codex-cli';
  readonly ready: boolean;
  /** An endpoint, a model name, or a reason. Never translated. */
  readonly detail: string;
}

export interface ShellPrefs {
  readonly model: ModelSettings;
  readonly narration: NarrationLanguage;
  /** Voice id per language, e.g. `en-US-AndrewNeural`. */
  readonly voices: Readonly<Record<Locale, string>>;
  readonly tavilyKey: string;
  readonly trace: boolean;
  readonly defaultBudget: SettingsBudgetId;
}

export interface VoiceOption {
  readonly id: string;
  /** Already in the reader's language — the main process does not translate. */
  readonly label: string;
}

export interface EngineStatus {
  readonly found: boolean;
  readonly path?: string;
}

export interface ShellSettings {
  readonly prefs: ShellPrefs;
  readonly setPref: <K extends keyof ShellPrefs>(key: K, value: ShellPrefs[K]) => void;
  /** Voices edge-tts offers, per language. */
  readonly voicesFor: (locale: Locale) => readonly VoiceOption[];
  readonly engine: EngineStatus;
  /** What the model settings currently resolve to. */
  readonly modelStatus?: ModelStatus;
  readonly recheckEngine: () => void;
  readonly recheckModel: () => void;
  /**
   * Speak a sample in that voice's own language — never a Chinese sentence in
   * an English voice, which is the noise this whole split exists to avoid.
   */
  readonly previewVoice: (locale: Locale) => void;
  readonly previewing?: Locale;
  readonly dataDir: string;
  readonly revealDataDir: () => void;
  readonly clearCache: () => Promise<void>;
}

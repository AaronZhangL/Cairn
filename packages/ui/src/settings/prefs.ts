/**
 * Everything the reader can set that the player alone can honour.
 *
 * Split deliberately from the settings the *main process* owns (voices, keys,
 * the pipeline cache): those need a subprocess or a file on disk, and they are
 * reached over RPC. What lives here is only what the webview can both read and
 * apply on its own, so `bun run dev` — which has no main process — still has a
 * working settings panel.
 *
 * Plain functions with no React and no storage in sight, for the same reason
 * `resume.ts` is: what is worth testing is the validation of stored JSON, which
 * an older build of this app wrote and may say anything at all.
 */
import { DEFAULT_LOCALE, type Locale, parseLocale } from '../i18n/locale';

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEMES)[number];

export const TEXT_SIZES = ['s', 'm', 'l', 'xl'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/**
 * Chrome and captions only — never the slide body.
 *
 * Slide type is already a fraction of the stage (`cqw`) and its length budgets
 * live in `fit.ts`; multiplying it here would overflow every layout without the
 * fit ladder ever knowing. See DESIGN.md.
 */
export const TEXT_SCALE: Readonly<Record<TextSize, number>> = {
  s: 0.9, m: 1, l: 1.12, xl: 1.25,
};

export interface Prefs {
  readonly locale: Locale;
  readonly theme: ThemeChoice;
  readonly textSize: TextSize;
  /** Where the transport starts each session; the player can still change it. */
  readonly rate: number;
  readonly autoNext: boolean;
  readonly resume: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  locale: DEFAULT_LOCALE,
  theme: 'system',
  textSize: 'm',
  rate: 1,
  autoNext: true,
  resume: true,
};

/** The rates the player offers; a stored rate outside this set is not honoured. */
const RATE_VALUES: readonly number[] = [0.75, 1, 1.25, 1.5, 2, 3];

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function parseStored(raw: string | null, fallback: Prefs = DEFAULT_PREFS): Prefs {
  if (raw === null) return fallback;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return fallback;
  }
  if (typeof value !== 'object' || value === null) return fallback;

  const p = value as Partial<Record<keyof Prefs, unknown>>;
  const rate = Number(p.rate);

  return {
    locale: parseLocale(p.locale, fallback.locale),
    theme: oneOf(p.theme, THEMES, fallback.theme),
    textSize: oneOf(p.textSize, TEXT_SIZES, fallback.textSize),
    rate: RATE_VALUES.includes(rate) ? rate : fallback.rate,
    autoNext: typeof p.autoNext === 'boolean' ? p.autoNext : fallback.autoNext,
    resume: typeof p.resume === 'boolean' ? p.resume : fallback.resume,
  };
}

/** Returns a new object; nothing is mutated. */
export function withPref<K extends keyof Prefs>(
  prefs: Prefs,
  key: K,
  value: Prefs[K],
): Prefs {
  return { ...prefs, [key]: value };
}

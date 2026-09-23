/**
 * Which language the interface is in.
 *
 * Separate from the language a *book* is in: a reader with an English interface
 * can walk a Chinese book, and its slides stay Chinese because they were
 * generated that way. Never derive one from the other.
 *
 * Plain functions, no React and no storage — what is worth testing here is the
 * parsing of stored and browser-supplied values, both of which may say anything.
 */

export const LOCALES = ['en', 'zh'] as const;

export type Locale = (typeof LOCALES)[number];

/** English, per the product decision. Not the browser's language. */
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Stored preferences are untrusted: an older build of this app wrote them. */
export function parseLocale(raw: unknown, fallback: Locale = DEFAULT_LOCALE): Locale {
  return isLocale(raw) ? raw : fallback;
}

/**
 * The closest supported locale for a list of BCP 47 tags, or nothing.
 *
 * Only offered as a *first-run* suggestion — the stored choice always wins, and
 * an unrecognised system language lands on `DEFAULT_LOCALE` rather than guessing.
 */
export function detectLocale(tags: readonly string[]): Locale | undefined {
  for (const tag of tags) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return undefined;
}

/** `format('{n} chapters', { n: 3 })`. Missing keys are left as written. */
export function format(
  template: string,
  params: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = params[key];
    return value === undefined ? whole : String(value);
  });
}

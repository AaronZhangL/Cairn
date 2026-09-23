/**
 * What language a book is written in.
 *
 * Needed because the narration has to match the script and the script has to
 * match the book: an English voice reading a Chinese sentence is noise, and so
 * is a Chinese voice reading an English one. The reader can override it, but
 * the default has to come from the book itself.
 *
 * Two sources, in order. An EPUB declares `dc:language` in its manifest and
 * that is authoritative when present. A TXT or a Markdown file declares
 * nothing, so the text is counted instead — which is also the fallback for an
 * EPUB whose metadata lies, and they do.
 */

export const CONTENT_LOCALES = ['en', 'zh'] as const;
export type ContentLocale = (typeof CONTENT_LOCALES)[number];

export const DEFAULT_CONTENT_LOCALE: ContentLocale = 'en';

const CJK = /[一-鿿㐀-䶿]/gu;
const LATIN = /[A-Za-z]/gu;

/**
 * A declared BCP 47 tag, narrowed to what can actually be spoken.
 *
 * Anything else — Japanese, French, an empty string — yields nothing rather
 * than a guess, and the caller falls back to counting.
 */
export function localeFromTag(tag: string | undefined): ContentLocale | undefined {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'zh') return 'zh';
  if (base === 'en') return 'en';
  return undefined;
}

/**
 * Letters per Latin word, so the two scripts can be compared at all.
 *
 * A raw character ratio is meaningless: one Chinese character carries about
 * what one English *word* does, not what one English letter does. Counting
 * letters against characters called an English book with a four-character
 * quotation in it Chinese.
 */
const LETTERS_PER_WORD = 5;

/** Above this share of the meaning-carrying units, the book is Chinese. */
const CJK_SHARE = 0.5;

export function localeFromText(text: string): ContentLocale {
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (cjk + latin === 0) return DEFAULT_CONTENT_LOCALE;

  const words = latin / LETTERS_PER_WORD;
  return cjk / (cjk + words) >= CJK_SHARE ? 'zh' : DEFAULT_CONTENT_LOCALE;
}

/** Below this many letters the count is noise and the declared tag is better. */
const ENOUGH_TO_JUDGE = 400;

/**
 * The book's language: counted from the text, with the declared tag as the
 * tie-breaker when there is not enough text to count.
 *
 * The text wins on purpose. EPUBs routinely ship `dc:language=en` on a Chinese
 * translation because the conversion tool defaulted it, and honouring that
 * would narrate the whole book in the wrong voice — a failure the reader only
 * discovers after paying for every station.
 */
export function detectContentLocale(
  declared: string | undefined,
  sample: string,
): ContentLocale {
  const letters = (sample.match(CJK)?.length ?? 0) + (sample.match(LATIN)?.length ?? 0);
  if (letters < ENOUGH_TO_JUDGE) return localeFromTag(declared) ?? localeFromText(sample);
  return localeFromText(sample);
}

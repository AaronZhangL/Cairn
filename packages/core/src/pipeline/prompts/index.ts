import type { ContentLocale } from '../../parse/language';
import { en } from './en';
import type { Prompts } from './types';
import { zh } from './zh';

const BY_LOCALE: Readonly<Record<ContentLocale, Prompts>> = { en, zh };

/**
 * The prompts for a book's own language.
 *
 * Never the reader's interface language: a Chinese book read by someone with an
 * English interface is still a Chinese book, and its slides and narration stay
 * Chinese. See `parse/language.ts`.
 */
export function promptsFor(locale: ContentLocale): Prompts {
  return BY_LOCALE[locale];
}

export type {
  ChapterBody, NoteMaterial, Prompts, RecapRequest, ReduceRequest, SlideRequest,
} from './types';

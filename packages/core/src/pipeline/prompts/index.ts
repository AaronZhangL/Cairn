import type { ContentLocale } from '../../parse/language';
import type { SourceKind } from '../../types';
import { en } from './en';
import type { Prompts } from './types';
import { withPreamble } from './xml';
import { zh } from './zh';

const BY_LOCALE: Readonly<Record<ContentLocale, Prompts>> = { en, zh };

/**
 * The prompts for a book's own language.
 *
 * Never the reader's interface language: a Chinese book read by someone with an
 * English interface is still a Chinese book, and its slides and narration stay
 * Chinese. See `parse/language.ts`.
 */
export function promptsFor(locale: ContentLocale, kind: SourceKind = 'book'): Prompts {
  const base = BY_LOCALE[locale];
  return kind === 'notes' ? forNotes(base) : base;
}

/** The book's prompts, told whose words these are. The rules stay the book's: they are what keeps the path honest. */
function forNotes(base: Prompts): Prompts {
  const frame = (system: string): string => withPreamble(system, base.notes.preamble);
  return {
    ...base,
    map: { ...base.map, system: frame(base.map.system) },
    classify: { ...base.classify, system: frame(base.classify.system) },
    reduce: { ...base.reduce, system: (type, coverage) => frame(base.reduce.system(type, coverage)) },
    slides: { ...base.slides, system: frame(base.slides.system) },
    recap: {
      ...base.recap,
      system: frame(base.recap.system),
      stageTitle: base.notes.stageTitle,
      title: base.notes.title,
      brief: base.notes.brief,
    },
  };
}

export type {
  ChapterBody, NoteMaterial, Prompts, RecapRequest, ReduceRequest, SlideRequest,
} from './types';

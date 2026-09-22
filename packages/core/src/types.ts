/** Domain types. No framework imports — shared by apps/web and apps/desktop. */
import type { IconName } from './icons';

export type { IconName };

export type BookType = 'knowledge' | 'narrative';
export type BookFormat = 'epub' | 'txt' | 'markdown';

/** One chapter from parsing. `text` lives only in IndexedDB and never enters an exported bundle. */
export interface Chapter {
  readonly idx: number;
  readonly title: string;
  readonly text: string;
  readonly wordCount: number;
}

export interface ParsedBook {
  readonly title: string;
  readonly author?: string;
  readonly format: BookFormat;
  readonly chapters: readonly Chapter[];
  readonly totalWords: number;
}

/** Map-stage output: one chapter compressed. Every downstream stage reads this, never the raw text. */
export interface ChapterNote {
  readonly idx: number;
  readonly title: string;
  /** One or two sentences on what this chapter covers. */
  readonly gist: string;
  readonly keyPoints: readonly string[];
  /** Verbatim excerpts, used by quote slides and for traceability. */
  readonly quotes: readonly string[];
}

/**
 * One station on the learning path. Produced by reduce; slides/narration are
 * generated later.
 *
 * `recap` is not one the model may choose: it marks the single closing station
 * appended to the path after reduce (see pipeline/recap.ts), which is built from
 * the path itself rather than from chapter notes.
 */
export type NodeKind = 'concept' | 'argument' | 'event' | 'character' | 'recap';

export interface PathNode {
  readonly id: string;
  readonly idx: number;
  readonly title: string;
  readonly kind: NodeKind;
  /** What this station must make clear. The slides stage expands this. */
  readonly brief: string;
  readonly keyPoints: readonly string[];
  /** Provenance: which chapters this station came from. Cheapest hedge against hallucination. */
  readonly sourceChapters: readonly number[];
  readonly estMinutes: number;
}

/** A contiguous run of stations. Named for what the reader is doing, not for the book's TOC. */
export interface Stage {
  readonly title: string;
  readonly nodeIds: readonly string[];
}

export interface Path {
  readonly bookId: string;
  readonly title: string;
  readonly type: BookType;
  readonly nodes: readonly PathNode[];
  readonly stages: readonly Stage[];
  readonly totalMinutes: number;
  readonly generatedAt: string;
}

/**
 * Slide layouts. No image generation: abstract ideas do not yield informative
 * illustrations, and a good deck is mostly type and simple diagrams anyway.
 * Every layout renders from structured data via React/SVG.
 *
 * `icon` is the one visual escape hatch, and it is not an illustration: it
 * names a glyph from the fixed local set in ./icons, drawn as a few stroked
 * paths at render time. It is optional everywhere and appears on exactly two
 * layouts — the station's opening card, and each side of a comparison. An icon
 * on every bullet is decoration, and decoration on every line is noise.
 */
export type Slide =
  | { readonly layout: 'title'; readonly kicker?: string; readonly title: string; readonly subtitle?: string; readonly icon?: IconName }
  | { readonly layout: 'points'; readonly heading: string; readonly points: readonly string[] }
  | { readonly layout: 'number'; readonly heading?: string; readonly items: readonly NumberItem[]; readonly note?: string }
  | {
      readonly layout: 'quote';
      readonly text: string;
      readonly cite?: string;
      /** Where this line was found verbatim. Absent means it was not found at all. */
      readonly source?: QuoteSource;
    }
  | { readonly layout: 'compare'; readonly heading?: string; readonly left: ComparePane; readonly right: ComparePane }
  | { readonly layout: 'flow'; readonly heading?: string; readonly steps: readonly string[] };

/**
 * Provenance for one quoted line, down to the excerpt it came from.
 *
 * `sourceChapters` already traces a station to its chapters, but a chapter is
 * ~3000 words — too coarse to answer "where does this sentence come from?".
 * The map stage already stores verbatim excerpts, so the finer link costs a
 * lookup rather than another pass over the book.
 */
export interface QuoteSource {
  /** Chapter index, matching ChapterNote.idx. */
  readonly chapter: number;
  /** Position in that chapter's `quotes`. */
  readonly index: number;
}

export interface NumberItem {
  readonly value: string;
  readonly label: string;
}

export interface ComparePane {
  readonly title: string;
  readonly points: readonly string[];
  readonly icon?: IconName;
}

/** A slide before narration timing exists, keyed to the sentence it appears on. */
export interface DraftSlide {
  readonly slide: Slide;
  readonly atSentence: number;
}

/** Output of the slides stage: what to show and what to say, no timing yet. */
export interface DraftDeck {
  readonly nodeId: string;
  readonly slides: readonly DraftSlide[];
  readonly sentences: readonly string[];
}

/** One narration sentence with its span in the audio. Drives subtitle highlight. */
export interface NarrationCue {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

/** Output of the tts stage: the deck with audio and timing attached. */
export interface NodeDeck {
  readonly nodeId: string;
  /** atMs = when this slide appears on the audio timeline. */
  readonly slides: readonly (Slide & { readonly atMs: number })[];
  readonly narration: readonly NarrationCue[];
  readonly audioPath: string;
  readonly durationMs: number;
}

/** Expected parse failures. Callers turn the code into a message a human can act on. */
export class ParseError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'unsupported_format'
      | 'empty_file'
      | 'corrupt_archive'
      | 'no_content'
      | 'decode_failed',
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

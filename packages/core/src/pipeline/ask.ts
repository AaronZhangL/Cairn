/**
 * Question answering over a book the user is walking through.
 *
 * Deliberately built without a vector store. Two cases, two shapes:
 *
 *   Anchored   — the user highlighted a passage. We already know the station and
 *                its sourceChapters, so there is nothing to search for. One call.
 *   Unanchored — "where else does the book discuss X?". The ChapterNote list is
 *                already a whole-book index (~20k tokens for a 200k-word book), so
 *                we hand the model that index, let it name the chapters, then load
 *                them. Two calls, no embeddings.
 *
 * Embeddings only start to earn their place when the index itself no longer fits
 * in context — a 7M-word serial, not an ordinary book. `ChapterLocator` exists so
 * a real retriever can be dropped in without touching callers.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ContentLocale } from '../parse/language';
import { promptsFor } from './prompts';
import type { Chapter, ChapterNote, PathNode } from '../types';

/** How much of the source chapter to include around a highlighted passage. */
const CONTEXT_CHARS = 1200;
/** Chapters the locator may return for an unanchored question. */
const MAX_LOCATED_CHAPTERS = 4;

export interface Answer {
  readonly text: string;
  /** False when the supplied material did not contain the answer. */
  readonly grounded: boolean;
  readonly sourceChapters: readonly number[];
  /** Present when ungrounded: where the user should look instead. */
  readonly suggestion?: string;
}

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // Every key in properties must appear in required; optionals are nullable instead
  required: ['text', 'grounded', 'suggestion'],
  properties: {
    text: { type: 'string' },
    grounded: { type: 'boolean' },
    suggestion: { type: ['string', 'null'] },
  },
} as const;


export interface AskAnchoredParams {
  readonly question: string;
  /** The passage the reader highlighted. */
  readonly selection?: string;
  readonly node: PathNode;
  /** Source chapters for that node, already loaded. */
  readonly chapters: readonly Chapter[];
  readonly signal?: AbortSignal;
}

/** The reader highlighted something. No search needed — the station points at its sources. */
export async function askAnchored(
  params: AskAnchoredParams,
  provider: LlmProvider,
  locale: ContentLocale = 'zh',
): Promise<Answer> {
  const { question, selection, node, chapters } = params;
  const prompts = promptsFor(locale);

  const material = chapters
    .map((c) => {
      const body = selection ? excerptAround(c.text, selection) : c.text.slice(0, CONTEXT_CHARS * 2);
      return prompts.ask.chapterTag(c.idx, c.title, body);
    })
    .join('\n\n');

  const raw = await provider.complete({
    system: prompts.ask.system,
    label: `ask:anchored:${node.id}`,
    prompt: prompts.ask.user({
      nodeTitle: node.title,
      brief: node.brief,
      ...(selection ? { selection } : {}),
      question,
      material,
    }),
    schema: ANSWER_SCHEMA,
    signal: params.signal,
  });

  return toAnswer(raw, chapters.map((c) => c.idx));
}

/**
 * Where a chapter lives.
 *
 * `bookId` is the seam for asking across several books at once — a reader with
 * three books by one author does ask across them. Nothing sets it today, and
 * absent means "the book being walked", so the single-book path costs nothing.
 */
export interface ChapterRef {
  readonly bookId?: string;
  readonly chapter: number;
}

export interface ChapterLocator {
  /** Returns the chapters relevant to a question. */
  locate(question: string, signal?: AbortSignal): Promise<readonly ChapterRef[]>;
}

/** One book's worth of index. `title` is only shown when there is more than one. */
export interface NoteSource {
  readonly bookId?: string;
  readonly title?: string;
  readonly notes: readonly ChapterNote[];
}

/** The common case: one book, no ids needed. */
export function singleBook(notes: readonly ChapterNote[]): readonly NoteSource[] {
  return [{ notes }];
}

/**
 * Locator that uses the ChapterNote list as the index.
 * No embeddings, no chunking, no vector store — the notes already summarize every
 * chapter, and for an ordinary book the whole index fits in one prompt.
 */
export function noteIndexLocator(
  sources: readonly NoteSource[],
  provider: LlmProvider,
  locale: ContentLocale = 'zh',
): ChapterLocator {
  const prompts = promptsFor(locale);
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['chapters'],
    properties: { chapters: { type: 'array', items: { type: 'integer' } } },
  } as const;

  const multi = sources.length > 1;

  return {
    async locate(question, signal) {
      const index = sources
        .map((source) => {
          const lines = source.notes.map((n) => `[${n.idx}] ${n.title}：${n.gist}`).join('\n');
          return multi && source.title ? `《${source.title}》\n${lines}` : lines;
        })
        .join('\n\n');

      const raw = await provider.complete({
        system: prompts.ask.locatorSystem,
        label: 'ask:locate',
        prompt: prompts.ask.locatorUser(question, MAX_LOCATED_CHAPTERS, index),
        schema,
        signal,
      });

      const parsed = parseJsonOutput<{ chapters?: unknown }>(raw);
      // A chapter number is only meaningful with the book it belongs to
      const owner = new Map<number, NoteSource>();
      for (const source of sources) {
        for (const note of source.notes) owner.set(note.idx, source);
      }

      return Array.isArray(parsed.chapters)
        ? parsed.chapters
            .map(Number)
            .filter((i) => Number.isInteger(i) && owner.has(i))
            .slice(0, MAX_LOCATED_CHAPTERS)
            .map((chapter) => {
              const bookId = owner.get(chapter)?.bookId;
              return bookId === undefined ? { chapter } : { chapter, bookId };
            })
        : [];
    },
  };
}

export interface AskBookParams {
  readonly question: string;
  readonly locator: ChapterLocator;
  readonly loadChapter: (ref: ChapterRef) => Promise<Chapter | undefined>;
  readonly signal?: AbortSignal;
}

/** No highlight — find the relevant chapters first, then answer from them. */
export async function askBook(
  params: AskBookParams,
  provider: LlmProvider,
  locale: ContentLocale = 'zh',
): Promise<Answer> {
  const prompts = promptsFor(locale);
  const located = await params.locator.locate(params.question, params.signal);
  if (located.length === 0) {
    return {
      text: prompts.ask.notFound,
      grounded: false,
      sourceChapters: [],
      suggestion: prompts.ask.rephrase,
    };
  }

  const chapters = (await Promise.all(located.map(params.loadChapter)))
    .filter((c): c is Chapter => c !== undefined);

  if (chapters.length === 0) {
    return {
      text: prompts.ask.textGone,
      grounded: false,
      sourceChapters: located.map((r) => r.chapter),
    };
  }

  const material = chapters
    .map((c) => prompts.ask.chapterTag(c.idx, c.title, c.text.slice(0, CONTEXT_CHARS * 3)))
    .join('\n\n');

  const raw = await provider.complete({
    system: prompts.ask.system,
    label: 'ask:book',
    prompt: prompts.ask.plainUser(params.question, material),
    schema: ANSWER_SCHEMA,
    signal: params.signal,
  });

  return toAnswer(raw, chapters.map((c) => c.idx));
}

/** Take a window around the highlighted passage so the model sees its surroundings. */
export function excerptAround(text: string, selection: string): string {
  const at = text.indexOf(selection);
  if (at < 0) return text.slice(0, CONTEXT_CHARS * 2);
  const start = Math.max(0, at - CONTEXT_CHARS);
  const end = Math.min(text.length, at + selection.length + CONTEXT_CHARS);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function toAnswer(raw: string, sourceChapters: readonly number[]): Answer {
  const parsed = parseJsonOutput<{ text?: unknown; grounded?: unknown; suggestion?: unknown }>(raw);
  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : '';
  return {
    text: typeof parsed.text === 'string' ? parsed.text.trim() : '',
    grounded: parsed.grounded === true,
    sourceChapters,
    ...(suggestion ? { suggestion } : {}),
  };
}

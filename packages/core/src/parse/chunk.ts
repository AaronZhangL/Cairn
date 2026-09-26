import type { Chapter } from '../types';
import { countWords } from './text';

/** Ideal input size (words) for a single map-stage LLM call. */
export const TARGET_WORDS = 3000;
/** Above this a block must be split again, or the summary loses detail. */
export const MAX_WORDS = 6000;
/** Below this it's a copyright page, dedication or blank — not worth an LLM call. */
export const MIN_WORDS = 150;

export interface Block {
  readonly title: string;
  readonly text: string;
  /** Source grouping (the owning spine item in EPUB). Only same-group blocks may merge. */
  readonly group?: string;
}

/**
 * Reshape titled text blocks into evenly sized chapters: merge adjacent small
 * blocks, split oversized ones at paragraph boundaries.
 * A real EPUB spine item can run to tens of thousands of words; feeding that
 * straight into map loses content.
 */
export interface ChunkOptions {
  /** Blocks under this are dropped. A note the reader wrote is never a copyright page, so notes pass 1. */
  readonly minWords?: number;
  /** Whether adjacent small blocks of one group merge. A note's own sections are its author's choice. */
  readonly merge?: boolean;
}

export function chunkBlocks(blocks: readonly Block[], options: ChunkOptions = {}): readonly Chapter[] {
  const { minWords = MIN_WORDS, merge = true } = options;
  const sized = blocks
    .map((b) => ({ ...b, words: countWords(b.text) }))
    .filter((b) => b.words > 0);

  const out: Chapter[] = [];
  let pending: {
    title: string; parts: string[]; words: number; group?: string; count: number;
  } | null = null;

  const flush = (): void => {
    if (!pending || pending.words < minWords) {
      pending = null;
      return;
    }
    out.push(makeChapter(out.length, qualify(pending.title, pending.group), pending.parts.join('\n\n')));
    pending = null;
  };

  for (const block of sized) {
    if (block.words > MAX_WORDS) {
      flush();
      const pieces = splitByParagraph(block.text);
      pieces.forEach((piece, i) => {
        const title = pieces.length > 1 && block.title ? `${block.title}（${i + 1}/${pieces.length}）` : block.title;
        out.push(makeChapter(out.length, title, piece));
      });
      continue;
    }

    const sameGroup = pending?.group === block.group;
    if (merge && pending && sameGroup && pending.words + block.words <= TARGET_WORDS) {
      pending.parts.push(block.text);
      pending.words += block.words;
      pending.count += 1;
      continue;
    }

    flush();
    pending = {
      title: block.title, parts: [block.text], words: block.words,
      group: block.group, count: 1,
    };
  }
  flush();

  return disambiguate(out);
}

/** Prefix section titles with the chapter name: "Getting a Repo" -> "Git Basics · Getting a Repo". */
function qualify(title: string, group?: string): string {
  if (title === '') return group ?? '';
  return group && group !== title ? `${group} · ${title}` : title;
}

/**
 * Duplicate titles are fatal for map/reduce — the model cannot tell five chapters
 * all called "Git Basics" apart. Number the duplicates in order of appearance.
 */
function disambiguate(chapters: readonly Chapter[]): readonly Chapter[] {
  const total = new Map<string, number>();
  for (const c of chapters) total.set(c.title, (total.get(c.title) ?? 0) + 1);

  const seen = new Map<string, number>();
  return chapters.map((c, idx) => {
    const count = total.get(c.title) ?? 1;
    // An untitled chapter is named later, in the book's language; numbering it here would hide that it has no name.
    if (count === 1 || c.title === '') return { ...c, idx };
    const n = (seen.get(c.title) ?? 0) + 1;
    seen.set(c.title, n);
    return { ...c, idx, title: `${c.title}（${n}/${count}）` };
  });
}

/** Accumulate whole paragraphs up to TARGET_WORDS. Never cut mid-sentence. */
function splitByParagraph(text: string): readonly string[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const pieces: string[] = [];
  let buffer: string[] = [];
  let words = 0;

  for (const p of paragraphs) {
    buffer.push(p);
    words += countWords(p);
    if (words >= TARGET_WORDS) {
      pieces.push(buffer.join('\n\n'));
      buffer = [];
      words = 0;
    }
  }
  if (words > 0) {
    // Fold a tiny tail into the previous piece rather than emit an orphan chapter
    if (words < MIN_WORDS && pieces.length > 0) {
      pieces[pieces.length - 1] += `\n\n${buffer.join('\n\n')}`;
    } else {
      pieces.push(buffer.join('\n\n'));
    }
  }
  return pieces;
}

function makeChapter(idx: number, title: string, text: string): Chapter {
  return { idx, title, text, wordCount: countWords(text) };
}

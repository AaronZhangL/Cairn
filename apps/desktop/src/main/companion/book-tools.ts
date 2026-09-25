import { randomUUID } from 'node:crypto';
import type { Chapter, ChapterNote } from '@cairn/core/types';
import type { EvidenceRecord } from '@cairn/core/companion/types';
import { escapeXml } from '@cairn/core/companion/xml';
import { library } from '../store';

const MAX_NOTES = 4;
const MAX_CHAPTERS = 2;
const NOTE_CHARS = 4_000;
const CHAPTER_CHARS = 12_000;

export class BookToolError extends Error {
  constructor(readonly code: 'invalid_indices' | 'chapter_missing') {
    super(code);
    this.name = 'BookToolError';
  }
}

export interface BookReadResult {
  readonly resultId: string;
  readonly text: string;
  readonly evidence: EvidenceRecord;
}

interface BookToolDeps {
  readonly loadNotes: (bookId: string) => Promise<readonly ChapterNote[]>;
  readonly loadChapter: (bookId: string, idx: number) => Promise<Chapter | undefined>;
}

const live: BookToolDeps = {
  loadNotes: (bookId) => library.loadNotes(bookId),
  loadChapter: (bookId, idx) => library.loadChapter(bookId, idx),
};

function checkIndices(indices: readonly number[], max: number): void {
  if (indices.length === 0 || indices.length > max || indices.some((idx) => !Number.isInteger(idx) || idx < 0)) {
    throw new BookToolError('invalid_indices');
  }
}

function boundedXml(value: string, maxChars: number): { text: string; truncated: boolean } {
  let text = '';
  let consumed = 0;
  for (const character of value) {
    const escaped = escapeXml(character);
    if (text.length + escaped.length > maxChars) break;
    text += escaped;
    consumed += character.length;
  }
  return { text, truncated: consumed < value.length };
}

export async function readNotes(
  bookId: string, indices: readonly number[], deps: BookToolDeps = live,
): Promise<BookReadResult> {
  checkIndices(indices, MAX_NOTES);
  const notes = await deps.loadNotes(bookId);
  const selected = indices.map((idx) => notes.find((note) => note.idx === idx));
  if (selected.some((note) => note === undefined)) throw new BookToolError('chapter_missing');
  const resultId = randomUUID();
  const present = selected.filter((note): note is ChapterNote => note !== undefined);
  const body = present.map((note) => {
    const full = escapeXml(JSON.stringify(note));
    if (full.length <= NOTE_CHARS) {
      return `<note chapter="${note.idx}" title="${boundedXml(note.title, 200).text}" truncated="false">${full}</note>`;
    }
    const gist = boundedXml(note.gist, 900).text;
    const points = note.keyPoints.slice(0, 3).map((point) => `<point>${boundedXml(point, 400).text}</point>`).join('');
    const quotes = note.quotes.slice(0, 2).map((quote) => `<quote>${boundedXml(quote, 400).text}</quote>`).join('');
    return `<note chapter="${note.idx}" title="${boundedXml(note.title, 200).text}" truncated="true"><gist>${gist}</gist>${points}${quotes}</note>`;
  }).join('');
  return {
    resultId,
    text: `<tool_result id="${resultId}" source="book">${body}</tool_result>`,
    evidence: { resultId, source: 'book', refs: present.map((note) => ({ chapter: note.idx, title: note.title })) },
  };
}

export async function readChapters(
  bookId: string, indices: readonly number[], deps: BookToolDeps = live,
): Promise<BookReadResult> {
  checkIndices(indices, MAX_CHAPTERS);
  const selected = await Promise.all(indices.map((idx) => deps.loadChapter(bookId, idx)));
  if (selected.some((chapter) => chapter === undefined)) throw new BookToolError('chapter_missing');
  const resultId = randomUUID();
  const present = selected.filter((chapter): chapter is Chapter => chapter !== undefined);
  const body = present.map((chapter) => {
    const content = boundedXml(chapter.text, CHAPTER_CHARS);
    return `<chapter idx="${chapter.idx}" title="${boundedXml(chapter.title, 200).text}" truncated="${content.truncated}">${content.text}</chapter>`;
  }).join('');
  return {
    resultId,
    text: `<tool_result id="${resultId}" source="book">${body}</tool_result>`,
    evidence: { resultId, source: 'book', refs: present.map((chapter) => ({ chapter: chapter.idx, title: chapter.title })) },
  };
}

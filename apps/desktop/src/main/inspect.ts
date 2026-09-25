/** A book, parsed and priced before a single model call, so the budget choice is informed. */
import { basename } from 'node:path';
import { bookIdFor } from '@cairn/core/books/builder';
import { parseBook } from '@cairn/core/parse';
import { suggestBudgets, shapeOf } from '@cairn/core/pipeline/budget';
import type { ParsedBook } from '@cairn/core/types';
import type { BookPreview } from '../shared/types';
import { voiceFor } from '../shared/settings';
import { readSettings } from './settings';

export async function readBook(filePath: string): Promise<ParsedBook> {
  const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  return parseBook(bytes, basename(filePath));
}

export async function inspect(filePath: string): Promise<BookPreview> {
  const book = await readBook(filePath);
  // Derived from this book's shape, never a remembered rung: a stored default
  // went stale the moment a shorter book came along
  const { choices, recommended } = suggestBudgets(shapeOf(book));

  return {
    id: bookIdFor(book, filePath),
    filePath,
    title: book.title,
    ...(book.author ? { author: book.author } : {}),
    chapters: book.chapters.length,
    words: book.totalWords,
    narration: voiceFor(await readSettings(), book.language),
    budgets: choices.map((c) => ({
      id: c.budget.id,
      minutes: c.budget.targetMinutes,
      honest: c.honest,
      ...(c.honest ? {} : { wordsPerNode: Math.round(c.wordsPerNode) }),
      recommended: c.budget.id === recommended,
    })),
  };
}

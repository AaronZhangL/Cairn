/**
 * Persisting the ask log, one file per book.
 *
 * Kept in the main process because it is the only side that can write, and kept
 * out of `install.ts` because it is the reader's data rather than the book's:
 * regenerating a book replaces the path but should not erase what confused
 * them about it.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { appendAsk, type AskRecord } from '@cairn/core/store/asks';
import { askLogFile } from '@cairn/core/store/library';
import { DATA_DIR } from './store';

const path = (bookId: string): string => join(DATA_DIR, askLogFile(bookId));

export async function readAsks(bookId: string): Promise<readonly AskRecord[]> {
  try {
    const raw = JSON.parse(await readFile(path(bookId), 'utf8')) as AskRecord[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export async function recordAsk(bookId: string, record: AskRecord): Promise<void> {
  try {
    await writeFile(path(bookId), JSON.stringify(appendAsk(await readAsks(bookId), record)));
  } catch {
    // A lost note about a question is not worth failing the answer over
  }
}

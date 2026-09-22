import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bookFile } from '@cairn/core/store/library';
import type { Chapter, ChapterNote, Path } from '@cairn/core/types';
import { libraryDir } from './library';

/**
 * Never cwd-derived: the app starts inside its own bundle, so `process.cwd()`
 * pointed at `Cairn.app/Contents/MacOS` and every generated book landed
 * somewhere the webview could not read and the next build deleted.
 *
 * Taken from `libraryDir()` rather than `library()`, which would bind the
 * loopback socket as a side effect of importing a storage module. The server is
 * started by whoever actually needs a URL.
 */
export const DATA_DIR = libraryDir();

const cache = new Map<string, unknown>();

async function json<T>(name: string): Promise<T> {
  const hit = cache.get(name);
  if (hit !== undefined) return hit as T;
  const value = JSON.parse(await readFile(join(DATA_DIR, name), 'utf8')) as T;
  cache.set(name, value);
  return value;
}

/** Drop a book's cached files after it is regenerated. */
export function forget(bookId: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`books/${bookId}/`)) cache.delete(key);
  }
}

export const loadPath = (bookId: string): Promise<Path> =>
  json<Path>(bookFile(bookId, 'path.json'));

export const loadNotes = (bookId: string): Promise<ChapterNote[]> =>
  json<ChapterNote[]>(bookFile(bookId, 'notes.json'));

/**
 * Chapter text stays out of what the player loads, so an anchored question
 * reads it here in the main process instead.
 */
export async function loadChapter(bookId: string, idx: number): Promise<Chapter | undefined> {
  const chapters = await json<Chapter[]>(bookFile(bookId, 'chapters.json')).catch(() => []);
  return chapters.find((c) => c.idx === idx);
}

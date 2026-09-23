import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bookFile, isBookId } from '@cairn/core/store/library';
import { finishReading, type ReadingRecord } from '@cairn/core/store/reading';
import { listBooks } from './install';
import { DATA_DIR, loadPath } from './store';

const readingPath = (bookId: string): string => join(DATA_DIR, bookFile(bookId, 'reading.json'));

export async function readReadingRecord(bookId: string): Promise<ReadingRecord | undefined> {
  if (!isBookId(bookId)) return undefined;
  let raw: string;
  try {
    raw = await readFile(readingPath(bookId), 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw cause;
  }
  const value: unknown = JSON.parse(raw);
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Partial<ReadingRecord>;
  return typeof record.pathGeneratedAt === 'string' && typeof record.finishedAt === 'string'
    ? { pathGeneratedAt: record.pathGeneratedAt, finishedAt: record.finishedAt }
    : undefined;
}

export async function markBookFinished(bookId: string, nodeId: string): Promise<boolean> {
  if (!isBookId(bookId)) return false;
  const entry = (await listBooks()).find((book) => book.id === bookId);
  if (!entry) return false;
  const path = await loadPath(bookId);
  const record = finishReading(entry, path, nodeId, new Date().toISOString());
  if (!record) return false;
  if ((await readReadingRecord(bookId))?.pathGeneratedAt === path.generatedAt) return true;
  const target = readingPath(bookId);
  const pending = `${target}.${randomUUID()}.tmp`;
  await writeFile(pending, JSON.stringify(record));
  await rename(pending, target);
  return true;
}

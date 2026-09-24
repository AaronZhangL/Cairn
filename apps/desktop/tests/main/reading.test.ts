import { beforeEach, expect, test } from 'bun:test';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Path } from '@cairn/core/types';

// The throwaway library `tests/setup.ts` created before any module loaded
const dir = process.env.CAIRN_DATA_DIR!;
const { markBookFinished, readReadingRecord } = await import('../../src/main/reading');

const path: Path = {
  bookId: 'book-one', title: 'Book', type: 'knowledge',
  nodes: [{ id: 'recap', idx: 0, title: 'Recap', kind: 'recap', brief: '', keyPoints: [], sourceChapters: [0], estMinutes: 2 }],
  stages: [], totalMinutes: 2, generatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(async () => {
  await mkdir(join(dir, 'books/book-one'), { recursive: true });
  await writeFile(join(dir, 'books.json'), JSON.stringify([{
    id: 'book-one', title: 'Book', stations: 1, minutes: 2, budgetId: 'brief',
    generatedAt: path.generatedAt, complete: true,
  }]));
  await writeFile(join(dir, 'books/book-one/path.json'), JSON.stringify(path));
  await rm(join(dir, 'books/book-one/reading.json'), { force: true });
});
test('only recap completion persists a reading record', async () => {
  expect(await markBookFinished('book-one', 'n0')).toBe(false);
  expect(await readReadingRecord('book-one')).toBeUndefined();
  expect(await markBookFinished('book-one', 'recap')).toBe(true);
  expect(await readReadingRecord('book-one')).toMatchObject({ pathGeneratedAt: path.generatedAt });
  expect(JSON.parse(await readFile(join(dir, 'books/book-one/reading.json'), 'utf8'))).toMatchObject({
    pathGeneratedAt: path.generatedAt,
  });
});

test('rejects a book id outside the library', async () => {
  expect(await markBookFinished('../elsewhere', 'recap')).toBe(false);
});

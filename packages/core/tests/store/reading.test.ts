import { describe, expect, test } from 'bun:test';
import type { LibraryEntry } from '../../src/store/library';
import type { Path } from '../../src/types';
import { finishReading, isFinished } from '../../src/store/reading';

const path: Path = {
  bookId: 'book-one', title: 'Book', type: 'knowledge',
  nodes: [
    { id: 'n0', idx: 0, title: 'Start', kind: 'concept', brief: '', keyPoints: [], sourceChapters: [0], estMinutes: 2 },
    { id: 'recap', idx: 1, title: 'Recap', kind: 'recap', brief: '', keyPoints: [], sourceChapters: [0], estMinutes: 2 },
  ],
  stages: [], totalMinutes: 4, generatedAt: '2026-01-01T00:00:00Z',
};
const entry: LibraryEntry = {
  id: 'book-one', title: 'Book', stations: 2, minutes: 4, budgetId: 'brief',
  generatedAt: path.generatedAt, complete: true,
};

describe('finished reading', () => {
  test('completing recap records a finished path', () => {
    const record = finishReading(entry, path, 'recap', '2026-01-02T00:00:00Z');
    expect(record).toEqual({ pathGeneratedAt: path.generatedAt, finishedAt: '2026-01-02T00:00:00Z' });
    expect(isFinished(entry, path, record)).toBe(true);
  });

  test('merely visiting recap or finishing another station does not count', () => {
    expect(finishReading(entry, path, 'n0', '2026-01-02T00:00:00Z')).toBeUndefined();
    expect(isFinished(entry, path, undefined)).toBe(false);
  });

  test('a path with unfinished deck generation does not count', () => {
    expect(finishReading({ ...entry, complete: false }, path, 'recap', '2026-01-02T00:00:00Z')).toBeUndefined();
  });

  test('regeneration invalidates an old completion record', () => {
    const record = finishReading(entry, path, 'recap', '2026-01-02T00:00:00Z');
    expect(isFinished(entry, { ...path, generatedAt: '2026-01-03T00:00:00Z' }, record)).toBe(false);
  });
});

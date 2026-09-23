import { describe, expect, test } from 'bun:test';
import type { Path } from '@cairn/core/types';
import type { LibraryEntry } from '@cairn/core/store/library';
import type { ReadingRecord } from '@cairn/core/store/reading';
import { recallReading, ShelfToolError } from '../../../src/main/companion/shelf-tools';

const path = (bookId: string, generatedAt = '2026-01-01'): Path => ({
  bookId, title: bookId, type: 'knowledge', generatedAt, stages: [], totalMinutes: 3,
  nodes: [
    { id: 'station', idx: 0, title: 'Attention & habit', kind: 'concept', brief: 'Attention shapes habit <daily>.', keyPoints: [], sourceChapters: [0], estMinutes: 2 },
    { id: 'recap', idx: 1, title: 'Recap', kind: 'recap', brief: 'Habit follows attention.', keyPoints: [], sourceChapters: [0], estMinutes: 1 },
  ],
});

const entry = (id: string, complete = true): LibraryEntry => ({
  id, title: id, stations: 2, minutes: 3, budgetId: 'brief', generatedAt: '2026-01-01', complete,
});

const deps = (entries: readonly LibraryEntry[], records: Record<string, ReadingRecord | undefined>) => ({
  listBooks: async () => entries,
  loadPath: async (id: string) => path(id),
  readReadingRecord: async (id: string) => records[id],
});

const finished: ReadingRecord = { pathGeneratedAt: '2026-01-01', finishedAt: '2026-01-02' };

describe('recall_reading', () => {
  test('returns matching stations from other finished books with shelf evidence', async () => {
    const result = await recallReading('attention', 'current', deps(
      [entry('current'), entry('finished'), entry('generated-only'), entry('not-built', false)],
      { current: finished, finished, 'generated-only': undefined, 'not-built': finished },
    ));
    expect(result.text).toContain('Attention &amp; habit');
    expect(result.text).toContain('habit &lt;daily&gt;');
    expect(result.text).not.toContain('generated-only');
    expect(result.text).not.toContain('not-built');
    expect(result.text).not.toContain('book="current"');
    expect(result.evidence).toEqual({
      resultId: result.resultId, source: 'shelf',
      refs: [
        { bookId: 'finished', bookTitle: 'finished', nodeId: 'station', nodeTitle: 'Attention & habit' },
        { bookId: 'finished', bookTitle: 'finished', nodeId: 'recap', nodeTitle: 'Recap' },
      ],
    });
  });

  test('rejects a record from an earlier generation and a path without a recap', async () => {
    const result = await recallReading('habit', 'current', {
      ...deps([entry('regenerated'), entry('no-recap')], { regenerated: finished, 'no-recap': finished }),
      loadPath: async (id: string) => id === 'regenerated'
        ? path(id, '2026-02-01')
        : { ...path(id), nodes: path(id).nodes.filter((node) => node.kind !== 'recap') },
    });
    expect(result.evidence.refs).toEqual([]);
    expect(result.text).not.toContain('<station');
  });

  test('returns no unrelated station and rejects empty queries', async () => {
    const result = await recallReading('quantum', 'current', deps([entry('finished')], { finished }));
    expect(result.evidence.refs).toEqual([]);
    await expect(recallReading('  ', 'current', deps([], {}))).rejects.toBeInstanceOf(ShelfToolError);
  });

  test('matches a Chinese question to a related finished-book station', async () => {
    const result = await recallReading('这个问题和认知偏差有什么关系？', 'current', {
      ...deps([entry('finished')], { finished }),
      loadPath: async (id) => ({
        ...path(id),
        nodes: path(id).nodes.map((node) => node.id === 'station'
          ? { ...node, title: '认知偏差', brief: '人常常高估眼前证据。' }
          : node),
      }),
    });
    expect(result.evidence.refs.map((ref) => ref.nodeId)).toContain('station');
  });

  test('does not open a book that has no finished-reading record', async () => {
    const result = await recallReading('attention', 'current', {
      ...deps([entry('unread')], {}),
      loadPath: async () => { throw new Error('unread path should not be opened'); },
    });
    expect(result.evidence.refs).toEqual([]);
  });

  test('bounds station count and escaped content', async () => {
    const largePath = path('finished');
    const station = largePath.nodes[0];
    const recap = largePath.nodes[1];
    if (!station || !recap) throw new Error('invalid test fixture');
    const result = await recallReading('attention', 'current', {
      ...deps([entry('finished')], { finished }),
      loadPath: async () => ({
        ...largePath,
        nodes: [
          ...Array.from({ length: 30 }, (_, idx) => ({
            ...station, id: `n${idx}`, brief: `attention ${'&'.repeat(3_000)}`,
          })),
          recap,
        ],
      }),
    });
    expect(result.evidence.refs.length).toBeLessThanOrEqual(8);
    expect(result.text.length).toBeLessThan(8_000);
  });
});

import { describe, expect, test } from 'bun:test';
import type { Chapter, ChapterNote } from '@cairn/core/types';
import { BookToolError, readChapters, readNotes } from '../../../src/main/companion/book-tools';

const note: ChapterNote = { idx: 2, title: 'A & B', gist: 'One < two', keyPoints: [], quotes: [] };
const chapter: Chapter = { idx: 2, title: 'A & B', text: 'Some <text> & more', wordCount: 4 };
const deps = {
  loadNotes: async () => [note],
  loadChapter: async (_bookId: string, idx: number) => idx === 2 ? chapter : undefined,
};

describe('book tools', () => {
  test('read_notes returns bounded XML with evidence for the requested chapter', async () => {
    const result = await readNotes('book-one', [2], deps);
    expect(result.text).toContain('One &lt; two');
    expect(result.text).toContain('A &amp; B');
    expect(result.evidence).toEqual({
      resultId: result.resultId, source: 'book', refs: [{ chapter: 2, title: 'A & B' }],
    });
  });

  test('read_chapter returns the actual text and marks truncation', async () => {
    const result = await readChapters('book-one', [2], {
      ...deps, loadChapter: async () => ({ ...chapter, text: 'x'.repeat(15_000) }),
    });
    expect(result.text).toContain('truncated="true"');
    expect(result.text.length).toBeLessThan(13_000);
    expect(result.evidence.refs).toEqual([{ chapter: 2, title: 'A & B' }]);
  });

  test('XML escaping does not expand a chapter beyond its tool budget', async () => {
    const result = await readChapters('book-one', [2], {
      ...deps, loadChapter: async () => ({ ...chapter, text: '&'.repeat(15_000) }),
    });
    expect(result.text.length).toBeLessThan(13_000);
  });

  test('a long note falls back to complete XML fields instead of partial JSON', async () => {
    const result = await readNotes('book-one', [2], {
      ...deps, loadNotes: async () => [{ ...note, gist: 'Long & '.repeat(1_000), keyPoints: ['point'.repeat(2_000)] }],
    });
    expect(result.text).toContain('truncated="true"');
    expect(result.text).toContain('<gist>');
    expect(result.text).toContain('</gist>');
    expect(result.text).not.toContain('{&quot;idx&quot;');
    expect(result.text.length).toBeLessThan(4_500);
  });

  test('rejects missing, invalid, or excessive chapter requests', async () => {
    await expect(readNotes('book-one', [3], deps)).rejects.toBeInstanceOf(BookToolError);
    await expect(readChapters('book-one', [-1], deps)).rejects.toBeInstanceOf(BookToolError);
    await expect(readChapters('book-one', [0, 1, 2], deps)).rejects.toBeInstanceOf(BookToolError);
  });
});

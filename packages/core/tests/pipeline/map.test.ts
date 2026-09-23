import { describe, expect, test } from 'bun:test';
import { mapChapters } from '../../src/pipeline/map';
import { memoryStore } from '../../src/pipeline/job';
import type { LlmProvider } from '../../src/llm/types';
import type { Chapter, ChapterNote } from '../../src/types';

const stub = (reply: unknown): LlmProvider => ({
  name: 'stub', suggestedConcurrency: 1, overheadTokens: 0,
  async complete() { return JSON.stringify(reply); },
});

const chapters: readonly Chapter[] = [
  { idx: 0, title: '第一章', text: '正文', wordCount: 2 },
];

const run = async (chapter: unknown): Promise<ChapterNote> => {
  const { notes } = await mapChapters(
    chapters,
    stub({ chapters: [chapter] }),
    memoryStore<readonly ChapterNote[]>(),
  );
  return notes[0]!;
};

describe('mapChapters structured material', () => {
  test('carries figures, contrasts, sequences and relations through', async () => {
    const note = await run({
      idx: 0, gist: '一句', keyPoints: ['要点'], quotes: ['原句'],
      figures: [{ value: '32 华氏度', label: '融点' }],
      contrasts: [{ about: '关注点', left: '终点', right: '过程' }],
      sequences: [{ title: '四步', steps: [{ mark: '1', text: '提示' }, { mark: '2', text: '渴望' }] }],
      relations: [{ from: '提示', how: '触发', to: '渴望' }],
    });

    expect(note.figures).toEqual([{ value: '32 华氏度', label: '融点' }]);
    expect(note.contrasts).toEqual([{ about: '关注点', left: '终点', right: '过程' }]);
    expect(note.sequences?.[0]?.steps).toHaveLength(2);
    expect(note.relations).toEqual([{ from: '提示', how: '触发', to: '渴望' }]);
  });

  test('drops a row with any empty cell rather than rendering half a fact', async () => {
    const note = await run({
      idx: 0, gist: '', keyPoints: [], quotes: [],
      figures: [{ value: '32 华氏度', label: '' }, { value: '', label: '融点' }],
      contrasts: [{ about: '关注点', left: '终点' }],
      relations: [{ from: '提示', how: '触发', to: '渴望' }],
      sequences: [],
    });

    expect(note.figures).toEqual([]);
    expect(note.contrasts).toEqual([]);
    expect(note.relations).toHaveLength(1);
  });

  test('a sequence needs more than one step, but a step may have no mark', async () => {
    const note = await run({
      idx: 0, gist: '', keyPoints: [], quotes: [],
      figures: [], contrasts: [], relations: [],
      sequences: [
        { title: '只有一步', steps: [{ mark: '1', text: '提示' }] },
        { title: '没有年份的过程', steps: [{ mark: '', text: '先' }, { mark: '', text: '后' }] },
      ],
    });

    expect(note.sequences).toHaveLength(1);
    expect(note.sequences?.[0]?.title).toBe('没有年份的过程');
    expect(note.sequences?.[0]?.steps[0]?.mark).toBe('');
  });

  test('a model that omits the new fields entirely still produces a valid note', async () => {
    const note = await run({ idx: 0, gist: '一句', keyPoints: ['要点'], quotes: [] });

    expect(note.gist).toBe('一句');
    expect(note.figures).toEqual([]);
    expect(note.sequences).toEqual([]);
  });
});

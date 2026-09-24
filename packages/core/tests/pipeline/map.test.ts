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

describe('mapChapters diagram material', () => {
  const base = {
    idx: 0, gist: '', keyPoints: [], quotes: [],
    figures: [], contrasts: [], sequences: [], relations: [],
  };
  const cell = (x: string, y: string, name: string) => ({ x, y, name, text: `${name}的说明` });

  test('carries cycles, ranks, quadrants, overlaps and causes through', async () => {
    const note = await run({
      ...base,
      cycles: [{ title: '习惯回路', steps: ['提示', '渴望', '反应', '奖赏'] }],
      ranks: [{ title: '需求层次', levels: ['自我实现', '尊重', '归属', '安全', '生理'] }],
      quadrants: [{
        xLow: '不紧急', xHigh: '紧急', yLow: '不重要', yHigh: '重要',
        cells: [cell('high', 'high', '立即做'), cell('low', 'high', '计划做'),
          cell('high', 'low', '授权'), cell('low', 'low', '删除')],
      }],
      overlaps: [{ sets: ['热爱', '擅长', '有人付钱'], meet: '天职' }],
      causes: [{ effect: '习惯中断', groups: [
        { name: '环境', causes: ['提示不可见'] },
        { name: '身份', causes: ['不认同自己', '目标导向'] },
      ] }],
    });

    expect(note.cycles?.[0]?.steps).toHaveLength(4);
    expect(note.ranks?.[0]?.levels[0]).toBe('自我实现');
    expect(note.quadrants?.[0]?.cells).toHaveLength(4);
    expect(note.overlaps?.[0]).toEqual({ sets: ['热爱', '擅长', '有人付钱'], meet: '天职' });
    expect(note.causes?.[0]?.groups[1]?.causes).toEqual(['不认同自己', '目标导向']);
  });

  test('a loop of two is a relation, and a ranking of two is a comparison', async () => {
    const note = await run({
      ...base,
      cycles: [{ title: '越…越…', steps: ['焦虑', '拖延'] }],
      ranks: [{ title: '两层', levels: ['上', '下'] }],
    });

    expect(note.cycles).toEqual([]);
    expect(note.ranks).toEqual([]);
  });

  test('a quadrant needs all four corners, each exactly once', async () => {
    const note = await run({
      ...base,
      quadrants: [
        {
          xLow: '低', xHigh: '高', yLow: '低', yHigh: '高',
          cells: [cell('high', 'high', '甲'), cell('high', 'high', '乙'),
            cell('low', 'low', '丙'), cell('low', 'high', '丁')],
        },
        {
          xLow: '低', xHigh: '高', yLow: '低', yHigh: '',
          cells: [cell('high', 'high', '甲'), cell('low', 'high', '乙'),
            cell('high', 'low', '丙'), cell('low', 'low', '丁')],
        },
      ],
    });

    expect(note.quadrants).toEqual([]);
  });

  test('an overlap needs two or three sets and a named meeting place', async () => {
    const note = await run({
      ...base,
      overlaps: [
        { sets: ['只有一个'], meet: '交集' },
        { sets: ['甲', '乙'], meet: '' },
        { sets: ['甲', '乙', '丙', '丁'], meet: '交集' },
      ],
    });

    expect(note.overlaps).toEqual([]);
  });

  test('causes need at least two groups, and a group with no cause is dropped', async () => {
    const note = await run({
      ...base,
      causes: [
        { effect: '中断', groups: [{ name: '环境', causes: ['看不见'] }] },
        { effect: '失败', groups: [
          { name: '环境', causes: ['看不见'] },
          { name: '空的', causes: [] },
          { name: '身份', causes: ['不认同'] },
        ] },
      ],
    });

    expect(note.causes).toHaveLength(1);
    expect(note.causes?.[0]?.groups.map((g) => g.name)).toEqual(['环境', '身份']);
  });
});

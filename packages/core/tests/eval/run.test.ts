import { describe, expect, test } from 'bun:test';
import { evaluateBook, type EvalBook, isFailed, type Scored } from '../../src/eval/run';
import { summarize } from '../../src/eval/summary';
import { budgetsFor } from '../../src/pipeline/budget';
import type { JobStore } from '../../src/pipeline/job';
import type { LlmProvider } from '../../src/llm/types';
import { byLabel, notes, station } from './fixtures';

const both = (p: LlmProvider) => ({ generate: p, judge: p, judgeName: 'stub' });

const memoryStore = (): JobStore<readonly string[]> => {
  const data = new Map<string, readonly string[]>();
  return { async get(id) { return data.get(id); }, async put(id, v) { data.set(id, v); } };
};

const reduceReply = JSON.stringify({
  stages: [{ title: '甲', nodes: [
    { title: '一', kind: 'concept', brief: 'b', keyPoints: [], sourceChapters: [0], estMinutes: 3 },
    { title: '二', kind: 'concept', brief: 'b', keyPoints: [], sourceChapters: [2], estMinutes: 3 },
  ] }],
});

const judged = {
  classify: JSON.stringify({ type: 'knowledge', reason: '' }),
  reduce: reduceReply,
  'eval:ideas': JSON.stringify({ ideas: ['一', '二'] }),
  'eval:coverage': JSON.stringify({ ideas: [{ index: 0, covered: true, station: 'n0' }] }),
  'eval:faithful': JSON.stringify({ stations: [] }),
  'eval:coherence': JSON.stringify({
    repeat: { pass: true, note: '' }, order: { pass: true, note: '' },
    salience: { pass: true, note: '' }, grouping: { pass: true, note: '' },
  }),
  'eval:pairwise.cb': JSON.stringify({ winner: 'A', reason: '' }),
  'eval:pairwise.bc': JSON.stringify({ winner: 'B', reason: '' }),
};

const book = (): EvalBook => ({
  id: 'b', title: '书', language: 'zh', kind: 'book',
  budget: budgetsFor({ totalWords: 50_000, chapterCount: 4 }).brief,
  totalWords: 50_000, notes,
  baselines: [{ type: 'knowledge', nodes: [station('n0', [3])], stages: [{ title: '乙', nodeIds: ['n0'] }] }],
});

describe('evaluateBook', () => {
  test('每次生成都打分并和基线比一次', async () => {
    const result = await evaluateBook(book(), both(byLabel(judged)), { runs: 2, ideasStore: memoryStore() });
    expect(result.candidates).toHaveLength(2);
    expect(result.comparisons.map((c) => c.outcome)).toEqual(['candidate', 'candidate']);
  });

  test('观点清单只抽一次，两边用同一份', async () => {
    const provider = byLabel(judged);
    await evaluateBook(book(), both(provider), { runs: 2, ideasStore: memoryStore() });
    expect(provider.seen.filter((r) => r.label === 'eval:ideas')).toHaveLength(1);
  });

  test('一次生成失败不影响其余，并记入结果', async () => {
    const { reduce: _, ...rest } = judged;
    const result = await evaluateBook(book(), both(byLabel(rest)), { runs: 1, ideasStore: memoryStore() });
    expect(result.candidates.filter(isFailed)).toHaveLength(1);
    expect(result.baselines).toHaveLength(1);
    expect(summarize([result]).failedRuns).toBe(1);
  });

  test('已打过分的基线不再评审', async () => {
    const first = await evaluateBook(book(), both(byLabel(judged)), { runs: 1, ideasStore: memoryStore() });
    const provider = byLabel(judged);
    const scored = first.candidates.filter((c): c is Scored => !isFailed(c));
    await evaluateBook({ ...book(), baselines: scored }, both(provider), { runs: 1, ideasStore: memoryStore() });
    expect(provider.seen.filter((r) => r.label === 'eval:coverage')).toHaveLength(1);
  });

  test('给定已有的 path 时只评审、不生成', async () => {
    const { reduce: _r, classify: _c, ...judgeOnly } = judged;
    const given = [{ type: 'knowledge' as const, nodes: [station('n0', [1])], stages: [{ title: '甲', nodeIds: ['n0'] }] }];
    const result = await evaluateBook({ ...book(), given }, both(byLabel(judgeOnly)), { runs: 3, ideasStore: memoryStore() });
    expect(result.candidates.filter(isFailed)).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
  });
});

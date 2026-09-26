import { describe, expect, test } from 'bun:test';
import type { Comparison } from '../../src/eval/judge';
import type { BookEval, Scored } from '../../src/eval/run';
import { MIN_PATHS, NOISE_BAND, summarize } from '../../src/eval/summary';
import { station } from './fixtures';

const pass = { pass: true, note: '' };
const scored = (faithful: number): Scored => ({
  type: 'knowledge', nodes: [station('n0', [0])], stages: [],
  structural: {
    stations: 1, minutes: 3, withinBudget: true, chapterCoverage: 1,
    positionSkew: 0, orderInversions: 0, duplicateSources: 0,
  },
  coverage: { share: 0.8, missing: [] },
  faithfulness: { share: faithful, unsupported: [] },
  coherence: { repeat: pass, order: pass, salience: pass, grouping: pass },
});
const won: Comparison = { outcome: 'candidate', reasons: [] };

const book = (baseline: Scored, candidate: Scored, runs = MIN_PATHS): BookEval => ({
  bookId: 'b', title: '书', budgetId: 'brief', ideas: [],
  baselines: [baseline],
  candidates: Array.from({ length: runs }, () => candidate),
  comparisons: Array.from({ length: runs }, () => won),
});

describe('summarize', () => {
  test('盲比赢了但护栏指标跌出噪声带，结论仍是变差', () => {
    const s = summarize([book(scored(1), scored(1 - NOISE_BAND * 2))]);
    expect(s.regressions).toEqual(['faithfulness']);
    expect(s.verdict).toBe('worse');
  });

  test('噪声带以内的下降不算退步', () => {
    const s = summarize([book(scored(1), scored(1 - NOISE_BAND / 2))]);
    expect(s.regressions).toEqual([]);
    expect(s.verdict).toBe('better');
  });

  test('样本不足时不下结论，哪怕某项跌出噪声带', () => {
    const s = summarize([book(scored(1), scored(0.5), MIN_PATHS - 1)]);
    expect(s.regressions).toEqual(['faithfulness']);
    expect(s.verdict).toBe('unclear');
  });
});

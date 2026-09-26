import { describe, expect, test } from 'bun:test';
import type { Comparison, Outcome } from '../../src/eval/judge';
import type { BookEval, Scored } from '../../src/eval/run';
import { MIN_PATHS, NOISE_BAND, signTest, summarize } from '../../src/eval/summary';
import { station } from './fixtures';

const pass = { pass: true, note: '' };
const scored = (faithful: number): Scored => ({
  type: 'knowledge', nodes: [station('n0', [0])], stages: [],
  structural: {
    stations: 1, minutes: 3, withinBudget: true, chapterCoverage: 1,
    positionSkew: 0, orderInversions: 0, duplicateSources: 0, textLength: 10,
  },
  coverage: { share: 0.8, missing: [] },
  faithfulness: { share: faithful, unsupported: [] },
  coherence: { repeat: pass, order: pass, salience: pass, grouping: pass },
});

const book = (baseline: Scored, candidate: Scored, outcomes: readonly Outcome[]): BookEval => ({
  bookId: 'b', judge: 'stub', title: '书', budgetId: 'brief', ideas: [],
  baselines: [baseline],
  candidates: outcomes.map(() => candidate),
  comparisons: outcomes.map((outcome): Comparison => ({ outcome, reasons: [] })),
});

const times = (n: number, o: Outcome): Outcome[] => Array.from({ length: n }, () => o);

describe('signTest', () => {
  test('双侧符号检验', () => {
    expect(signTest(7, 0)).toBeCloseTo(0.015625);
    expect(signTest(2, 5)).toBeCloseTo(0.453125);
    expect(signTest(0, 0)).toBe(1);
  });
});

describe('summarize', () => {
  test('代码没变时的 2 胜 5 负判为看不出差别：换评审后的自比曾被判成变差', () => {
    const outcomes = [...times(2, 'candidate'), ...times(5, 'baseline'), ...times(2, 'tie')];
    expect(summarize([book(scored(1), scored(1), outcomes)]).verdict).toBe('unclear');
  });

  test('显著的胜负才下结论', () => {
    expect(summarize([book(scored(1), scored(1), times(8, 'candidate'))]).verdict).toBe('better');
    expect(summarize([book(scored(1), scored(1), times(8, 'baseline'))]).verdict).toBe('worse');
  });

  test('盲比显著地赢了，但护栏指标跌出噪声带，结论仍是变差', () => {
    const s = summarize([book(scored(1), scored(1 - NOISE_BAND * 2), times(8, 'candidate'))]);
    expect(s.regressions).toEqual(['faithfulness']);
    expect(s.verdict).toBe('worse');
  });

  test('噪声带以内的下降不算退步', () => {
    const s = summarize([book(scored(1), scored(1 - NOISE_BAND / 2), times(8, 'candidate'))]);
    expect(s.regressions).toEqual([]);
    expect(s.verdict).toBe('better');
  });

  test('样本不足时不下结论，哪怕某项跌出噪声带', () => {
    const s = summarize([book(scored(1), scored(0.5), times(MIN_PATHS - 1, 'baseline'))]);
    expect(s.regressions).toEqual(['faithfulness']);
    expect(s.verdict).toBe('unclear');
  });
});

import { describe, expect, test } from 'bun:test';
import {
  type BookShape, budgetsFor, type BudgetId, clampNodeMinutes, exceedsBudget, fullWalkMinutes,
  suggestBudgets, suggestNodeCount, totalMinutes,
} from '../../src/pipeline/budget';
import type { PathNode } from '../../src/types';

const node = (estMinutes: number): PathNode => ({
  id: 'n', idx: 0, title: 't', kind: 'concept', brief: '',
  keyPoints: [], sourceChapters: [0], estMinutes,
});

const shape = (totalWords: number, chapterCount = 40): BookShape => ({ totalWords, chapterCount });

/** The book the rungs were calibrated against. */
const PRO_GIT = shape(200_000, 86);
const ESSAYS = shape(40_000, 24);
const SERIAL = shape(7_500_000, 900);

const ALL: readonly BudgetId[] = ['quick', 'brief', 'solid', 'full'];
const SHAPES: readonly BookShape[] = [ESSAYS, shape(90_000, 12), PRO_GIT, shape(600_000, 300), SERIAL];

describe('预算档位自洽', () => {
  test('任何篇幅下，站数×每站时长都覆盖目标区间', () => {
    for (const s of SHAPES) {
      for (const id of ALL) {
        const b = budgetsFor(s)[id];
        const [loN, hiN] = b.nodeRange;
        const [loM, hiM] = b.minutesPerNode;
        // 最少的站×最短每站 不能高于目标上限；最多的站×最长每站 不能低于目标下限
        expect(loN * loM).toBeLessThanOrEqual(b.maxMinutes);
        expect(hiN * hiM).toBeGreaterThanOrEqual(b.minMinutes);
      }
    }
  });

  test('四档按时长递增且不重叠', () => {
    for (const s of SHAPES) {
      const ordered = ALL.map((id) => budgetsFor(s)[id]);
      for (let i = 1; i < ordered.length; i += 1) {
        expect(ordered[i]!.minMinutes).toBeGreaterThan(ordered[i - 1]!.maxMinutes);
      }
    }
  });

  test('预算越大站数越多', () => {
    for (const s of SHAPES) {
      const b = budgetsFor(s);
      expect(b.full.nodeRange[0]).toBeGreaterThan(b.quick.nodeRange[1]);
    }
  });

  test('每站时长不随预算显著变化——短预算靠砍站而非讲浅', () => {
    const b = budgetsFor(PRO_GIT);
    for (const id of ALL) expect(b[id].minutesPerNode[0]).toBeLessThanOrEqual(3);
  });
});

describe('档位按书推导，而不是写死的时长', () => {
  // 回归：四档曾经是常量 10/30/60/120 分钟。一本 4 万字的随笔集和一本 750 万字的
  // 连载共用同一把梯子，「完整走一遍」在前者是超读，在后者是十分之一。
  test('薄书的完整档明显短于厚书的完整档', () => {
    expect(budgetsFor(ESSAYS).full.maxMinutes)
      .toBeLessThan(budgetsFor(shape(600_000, 300)).full.minMinutes);
  });

  test('完整走一遍的时长随篇幅单调不减', () => {
    const lengths = [10_000, 50_000, 200_000, 800_000, 5_000_000];
    const minutes = lengths.map((w) => fullWalkMinutes(shape(w)));
    for (let i = 1; i < minutes.length; i += 1) {
      expect(minutes[i]!).toBeGreaterThanOrEqual(minutes[i - 1]!);
    }
  });

  test('极端篇幅仍落在可走完的区间里', () => {
    expect(fullWalkMinutes(shape(500))).toBe(30);
    expect(fullWalkMinutes(shape(50_000_000))).toBe(240);
  });

  test('在锚点书上仍然给出约两小时的完整档', () => {
    expect(fullWalkMinutes(PRO_GIT)).toBe(120);
    expect(budgetsFor(PRO_GIT).full.label).toContain('2 小时');
    expect(budgetsFor(PRO_GIT).quick.label).toContain('分钟');
  });

  test('章节少的书不会被拆成过多的站', () => {
    const thin = budgetsFor({ totalWords: 200_000, chapterCount: 4 });
    expect(thin.full.nodeRange[1]).toBeLessThanOrEqual(8);
  });
});

describe('clampNodeMinutes', () => {
  const b = budgetsFor(PRO_GIT);
  test('钳到档位下限', () => expect(clampNodeMinutes(0, b.full)).toBe(3));
  test('钳到档位上限', () => expect(clampNodeMinutes(40, b.quick)).toBe(3));
  test('NaN 按下限', () => expect(clampNodeMinutes(Number.NaN, b.solid)).toBe(3));
  test('区间内取整', () => expect(clampNodeMinutes(3.4, b.full)).toBe(3));
});

describe('exceedsBudget', () => {
  const b = budgetsFor(PRO_GIT);

  test('略超目标上限仍在容差内', () => {
    const nodes = Array.from({ length: 25 }, () => node(5));
    expect(totalMinutes(nodes)).toBe(125);
    expect(exceedsBudget(nodes, b.full)).toBe(false);
  });

  test('超出容差被识别 —— 125 分钟那种漏网必须堵上', () => {
    const nodes = Array.from({ length: 40 }, () => node(5));
    expect(totalMinutes(nodes)).toBe(200);
    expect(exceedsBudget(nodes, b.full)).toBe(true);
  });

  test('小预算下超标同样被识别', () => {
    expect(exceedsBudget(Array.from({ length: 10 }, () => node(3)), b.quick)).toBe(true);
  });
});

describe('suggestNodeCount', () => {
  test('站数落在档位区间内', () => {
    for (const s of SHAPES) {
      for (const id of ALL) {
        const budget = budgetsFor(s)[id];
        for (const words of [20_000, 200_000, 7_500_000]) {
          const n = suggestNodeCount(words, budget);
          expect(n).toBeGreaterThanOrEqual(budget.nodeRange[0]);
          expect(n).toBeLessThanOrEqual(budget.nodeRange[1]);
        }
      }
    }
  });

  test('书越厚站数越多', () => {
    const b = budgetsFor(PRO_GIT).full;
    expect(suggestNodeCount(500_000, b)).toBeGreaterThan(suggestNodeCount(80_000, b));
  });
});

describe('suggestBudgets', () => {
  test('普通篇幅的书四档都诚实可选', () => {
    expect(suggestBudgets(PRO_GIT).choices.every((c) => c.honest)).toBe(true);
  });

  test('750 万字的书短档位被标为不诚实', () => {
    const quick = suggestBudgets(SERIAL).choices.find((c) => c.budget.id === 'quick')!;
    expect(quick.honest).toBe(false);
    expect(quick.note).toContain('空泛');
  });

  test('不诚实的档位仍然返回，由界面决定怎么呈现', () => {
    expect(suggestBudgets(SERIAL).choices).toHaveLength(4);
  });

  test('厚书推荐完整档，薄书推荐短档', () => {
    expect(suggestBudgets(shape(400_000, 60)).recommended).toBe('full');
    expect(suggestBudgets(shape(60_000, 20)).recommended).toBe('brief');
  });
});

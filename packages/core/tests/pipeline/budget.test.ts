import { describe, expect, test } from 'bun:test';
import {
  BUDGETS, clampNodeMinutes, exceedsBudget, suggestBudgets, suggestNodeCount, totalMinutes,
  type BudgetId,
} from '../../src/pipeline/budget';
import type { PathNode } from '../../src/types';

const node = (estMinutes: number): PathNode => ({
  id: 'n', idx: 0, title: 't', kind: 'concept', brief: '',
  keyPoints: [], sourceChapters: [0], estMinutes,
});
const ALL = Object.keys(BUDGETS) as BudgetId[];

describe('预算档位自洽', () => {
  test.each(ALL)('%s 的站数×每站时长覆盖目标区间', (id) => {
    const b = BUDGETS[id];
    const [loN, hiN] = b.nodeRange;
    const [loM, hiM] = b.minutesPerNode;
    // 最少的站×最短每站 不能高于目标上限；最多的站×最长每站 不能低于目标下限
    expect(loN * loM).toBeLessThanOrEqual(b.maxMinutes);
    expect(hiN * hiM).toBeGreaterThanOrEqual(b.minMinutes);
  });

  test('档位按时长递增且不重叠', () => {
    const ordered = ALL.map((id) => BUDGETS[id]);
    for (let i = 1; i < ordered.length; i += 1) {
      expect(ordered[i]!.minMinutes).toBeGreaterThan(ordered[i - 1]!.maxMinutes);
    }
  });

  test('预算越大站数越多', () => {
    expect(BUDGETS.full.nodeRange[0]).toBeGreaterThan(BUDGETS.quick.nodeRange[1]);
  });

  test('每站时长不随预算显著变化——短预算靠砍站而非讲浅', () => {
    for (const id of ALL) expect(BUDGETS[id].minutesPerNode[0]).toBeLessThanOrEqual(3);
  });
});

describe('clampNodeMinutes', () => {
  test('钳到档位下限', () => expect(clampNodeMinutes(0, BUDGETS.full)).toBe(3));
  test('钳到档位上限', () => expect(clampNodeMinutes(40, BUDGETS.quick)).toBe(3));
  test('NaN 按下限', () => expect(clampNodeMinutes(Number.NaN, BUDGETS.solid)).toBe(3));
  test('区间内取整', () => expect(clampNodeMinutes(3.4, BUDGETS.full)).toBe(3));
});

describe('exceedsBudget', () => {
  test('略超目标上限仍在容差内', () => {
    expect(exceedsBudget([node(5), node(5), node(5), node(5), node(5),
      node(5), node(5), node(5), node(5), node(5),
      node(5), node(5), node(5), node(5), node(5),
      node(5), node(5), node(5), node(5), node(5),
      node(5), node(5), node(5), node(5), node(5)], BUDGETS.full)).toBe(false);
  });

  test('超出容差被识别 —— 125 分钟那种漏网必须堵上', () => {
    const nodes = Array.from({ length: 40 }, () => node(5));
    expect(totalMinutes(nodes)).toBe(200);
    expect(exceedsBudget(nodes, BUDGETS.full)).toBe(true);
  });

  test('小预算下超标同样被识别', () => {
    expect(exceedsBudget(Array.from({ length: 10 }, () => node(3)), BUDGETS.quick)).toBe(true);
  });
});

describe('suggestNodeCount', () => {
  test('站数落在档位区间内', () => {
    for (const id of ALL) {
      const [lo, hi] = BUDGETS[id].nodeRange;
      for (const words of [20_000, 200_000, 7_500_000]) {
        const n = suggestNodeCount(words, BUDGETS[id]);
        expect(n).toBeGreaterThanOrEqual(lo);
        expect(n).toBeLessThanOrEqual(hi);
      }
    }
  });

  test('书越厚站数越多', () => {
    expect(suggestNodeCount(500_000, BUDGETS.full))
      .toBeGreaterThan(suggestNodeCount(80_000, BUDGETS.full));
  });
});

describe('suggestBudgets', () => {
  test('普通篇幅的书四档都诚实可选', () => {
    const { choices } = suggestBudgets(200_000);
    expect(choices.every((c) => c.honest)).toBe(true);
  });

  test('700 万字的书短档位被标为不诚实', () => {
    const { choices } = suggestBudgets(7_500_000);
    const quick = choices.find((c) => c.budget.id === 'quick')!;
    expect(quick.honest).toBe(false);
    expect(quick.note).toContain('空泛');
  });

  test('不诚实的档位仍然返回，由界面决定怎么呈现', () => {
    expect(suggestBudgets(7_500_000).choices).toHaveLength(4);
  });

  test('厚书推荐完整档，薄书推荐短档', () => {
    expect(suggestBudgets(400_000).recommended).toBe('full');
    expect(suggestBudgets(60_000).recommended).toBe('brief');
  });
});

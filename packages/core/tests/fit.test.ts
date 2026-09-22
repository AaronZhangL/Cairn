import { describe, expect, it } from 'bun:test';
import { BUDGETS, fitAll, fitOf, fitStep, HARD_CAP, overBudget } from '../src/fit';

/** n CJK characters, which `units` counts as n. */
const cjk = (n: number): string => '字'.repeat(n);

describe('fitStep', () => {
  it('leaves a string that fits at the designed size alone', () => {
    expect(fitStep(10, 20)).toBe(0);
    expect(fitStep(20, 20)).toBe(0);
  });

  it('steps down one rung for a string the first scale can absorb', () => {
    expect(fitStep(21, 20)).toBe(1);
    expect(fitStep(25, 20)).toBe(1);
  });

  it('steps down two rungs past the first scale', () => {
    expect(fitStep(26, 20)).toBe(2);
    expect(fitStep(200, 20)).toBe(2);
  });

  it('treats a zero budget as no constraint rather than dividing by it', () => {
    expect(fitStep(50, 0)).toBe(0);
  });
});

describe('fitOf', () => {
  it('measures CJK per character and Latin per half', () => {
    // The same field, the same visual width, two scripts.
    expect(fitOf(cjk(BUDGETS.title), 'title')).toBe(0);
    expect(fitOf('a'.repeat(BUDGETS.title * 2), 'title')).toBe(0);
  });

  it('leaves the value that started this alone, and catches longer ones', () => {
    // "32华氏度" is 4 units (two digits at a half each, three CJK at one). It
    // never needed a smaller size — it needed a column that grows, which is
    // what `fit-content(32cqw)` in slide.css now gives it. The ladder is for
    // the values past that.
    expect(fitOf('32华氏度', 'value')).toBe(0);
    expect(fitOf('32华氏度左右起', 'value')).toBe(1);
    expect(fitOf('32华氏度左右起步价', 'value')).toBe(2);
  });
});

describe('fitAll', () => {
  it('takes the step from the longest item so a list stays one size', () => {
    const fits = cjk(BUDGETS.point);
    const over = cjk(Math.ceil(BUDGETS.point * 1.5));
    expect(fitAll([fits, fits], 'point')).toBe(0);
    expect(fitAll([fits, over, fits], 'point')).toBe(2);
  });

  it('is 0 for an empty list', () => {
    expect(fitAll([], 'point')).toBe(0);
  });
});

describe('overBudget', () => {
  it('is false everywhere the ladder still has a rung', () => {
    expect(overBudget(cjk(Math.floor(BUDGETS.title * HARD_CAP)), 'title')).toBe(false);
  });

  it('is true once no size would make it fit', () => {
    expect(overBudget(cjk(Math.ceil(BUDGETS.title * HARD_CAP) + 1), 'title')).toBe(true);
  });

  it('meets the ladder with no gap: nothing is both step-2 and over budget', () => {
    // If these drifted apart, a string could be too long for the smallest rung
    // and still render.
    const last = cjk(Math.floor(BUDGETS.heading * HARD_CAP));
    expect(fitOf(last, 'heading')).toBe(2);
    expect(overBudget(last, 'heading')).toBe(false);
  });
});

import { describe, expect, test } from 'bun:test';
import { structuralMetrics } from '../../src/eval/metrics';
import { budgetsFor } from '../../src/pipeline/budget';
import { notes, station } from './fixtures';

const budget = { ...budgetsFor({ totalWords: 50_000, chapterCount: 4 }).brief, minMinutes: 5, maxMinutes: 10 };

describe('structuralMetrics', () => {
  test('覆盖率按被引用的章节去重计算', () => {
    const m = structuralMetrics([station('n0', [0, 1]), station('n1', [1])], notes, budget);
    expect(m.chapterCoverage).toBe(0.5);
  });

  test('只引用后半本时位置偏移为正', () => {
    const late = structuralMetrics([station('n0', [2]), station('n1', [3])], notes, budget);
    const even = structuralMetrics([station('n0', [0]), station('n1', [3])], notes, budget);
    expect(late.positionSkew).toBeGreaterThan(0);
    expect(even.positionSkew).toBeCloseTo(0);
  });

  test('相邻站点起始章倒退才算一次倒退', () => {
    const m = structuralMetrics([station('n0', [2]), station('n1', [0]), station('n2', [1])], notes, budget);
    expect(m.orderInversions).toBe(1);
  });

  test('取材章节完全相同的后一站算重复', () => {
    const m = structuralMetrics([station('n0', [1, 0]), station('n1', [0, 1]), station('n2', [0])], notes, budget);
    expect(m.duplicateSources).toBe(1);
  });

  test('预算判定和 reduce 一致：容差内的超出和低于下限都不算超预算', () => {
    const at = (...minutes: number[]) =>
      structuralMetrics(minutes.map((m, i) => station(`n${i}`, [0], m)), notes, budget).withinBudget;
    expect(at(3)).toBe(true);
    expect(at(5, 6)).toBe(true);
    expect(at(6, 6)).toBe(false);
  });

  test('引用不存在的章节不计入覆盖和位置', () => {
    const m = structuralMetrics([station('n0', [0, 99])], notes, budget);
    expect(m.chapterCoverage).toBe(0.25);
    expect(m.positionSkew).toBeCloseTo(-0.5);
  });
});

import { describe, expect, it } from 'bun:test';
import { revealCount, revealProgress } from '../../src/slides/reveal';

describe('revealProgress', () => {
  // Cues at 0 / 2s / 4s / 6s; one slide spans the middle two.
  const starts = [0, 2000, 4000, 6000];

  it('steps at the cues inside the span, not on a timer', () => {
    // Span [1000, 7000) contains the cues at 2000, 4000 and 6000.
    expect(revealProgress(starts, 1000, 7000, 1500)).toBe(0);
    expect(revealProgress(starts, 1000, 7000, 2000)).toBe(0.25);
    expect(revealProgress(starts, 1000, 7000, 4000)).toBe(0.5);
    expect(revealProgress(starts, 1000, 7000, 6000)).toBe(0.75);
  });

  it('never reaches 1 on the last beat, so the final item keeps a step', () => {
    expect(revealProgress(starts, 1000, 7000, 6999)).toBeLessThan(1);
  });

  it('a cue exactly on the span boundary is not a beat', () => {
    // 2000 starts the span, so only 4000 and 6000 divide it.
    expect(revealProgress(starts, 2000, 7000, 4000)).toBeCloseTo(1 / 3, 5);
  });

  it('falls back to elapsed time when the span holds no cue', () => {
    expect(revealProgress([0], 0, 4000, 1000)).toBe(0.25);
    expect(revealProgress([], 0, 4000, 3000)).toBe(0.75);
  });

  it('clamps outside the span and survives a zero-length one', () => {
    expect(revealProgress([], 1000, 5000, 0)).toBe(0);
    expect(revealProgress([], 1000, 5000, 99_000)).toBe(1);
    expect(revealProgress([], 3000, 3000, 3000)).toBe(1);
  });
});

describe('revealCount', () => {
  it('always shows the first item — an empty slide reads as a failure', () => {
    expect(revealCount(3, 0)).toBe(1);
    expect(revealCount(3, -5)).toBe(1);
  });

  it('adds one item per step and stops at the total', () => {
    expect(revealCount(3, 0.34)).toBe(2);
    expect(revealCount(3, 0.67)).toBe(3);
    expect(revealCount(3, 1)).toBe(3);
    expect(revealCount(3, 99)).toBe(3);
  });

  it('handles an empty list', () => {
    expect(revealCount(0, 0.5)).toBe(0);
  });

  it('a static render (progress 1) shows everything', () => {
    expect(revealCount(5, 1)).toBe(5);
  });
});

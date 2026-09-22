import { describe, expect, it } from 'bun:test';
import { magnitude, magnitudes } from '../../src/slides/magnitude';

describe('magnitude', () => {
  it('reads the leading quantity out of a display string', () => {
    expect(magnitude('110 年')).toBe(110);
    expect(magnitude('1 枚')).toBe(1);
    expect(magnitude('0 枚')).toBe(0);
    expect(magnitude('68%')).toBe(68);
    expect(magnitude('3.5 倍')).toBe(3.5);
    expect(magnitude('约 42 分钟')).toBe(42);
  });

  it('applies a scale word that follows the digits', () => {
    // Without this, "3 万" beside "500" would draw as 3 beside 500 — a bar
    // asserting the opposite of the truth.
    expect(magnitude('3 万')).toBe(30_000);
    expect(magnitude('1.5万')).toBe(15_000);
    expect(magnitude('2 亿')).toBe(2e8);
    expect(magnitude('12K')).toBe(12_000);
  });

  it('ignores a scale word belonging to a later quantity', () => {
    expect(magnitude('110 年 · 第 3 万 次')).toBe(110);
  });

  it('strips thousands separators', () => {
    expect(magnitude('1,250 人')).toBe(1250);
  });

  it('is undefined when there is no number at all', () => {
    expect(magnitude('几乎没有')).toBeUndefined();
    expect(magnitude('')).toBeUndefined();
  });
});

describe('magnitudes', () => {
  it('returns fractions of the largest value', () => {
    expect(magnitudes(['1 枚', '0 枚', '110 年'])).toEqual([1 / 110, 0, 1]);
  });

  it('refuses the whole set when any value is unreadable', () => {
    // All or nothing: one unreadable value and the rest would compare against
    // a denominator the source never stated.
    expect(magnitudes(['1 枚', '几乎没有'])).toBeUndefined();
  });

  it('refuses a set with no positive value to scale against', () => {
    expect(magnitudes(['0', '0'])).toBeUndefined();
  });

  it('refuses negatives rather than drawing a bar backwards', () => {
    expect(magnitudes(['-5', '10'])).toBeUndefined();
  });
});

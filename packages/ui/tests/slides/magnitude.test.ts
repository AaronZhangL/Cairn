import { describe, expect, it } from 'bun:test';
import { magnitude, magnitudes, unitOf } from '../../src/slides/magnitude';

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
    expect(magnitudes(['1 枚', '0 枚', '110 枚'])).toEqual([1 / 110, 0, 1]);
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

  it('refuses a set whose values are not the same kind of thing', () => {
    // The bug this guards: a station quoting "1%" of improvement beside the
    // "32华氏度" melting point drew 1 against 32 — a ratio between a
    // proportion and a temperature, which the book never claimed.
    expect(magnitudes(['1%', '32华氏度'])).toBeUndefined();
    expect(magnitudes(['110 年', '1 枚'])).toBeUndefined();
    // A bare number is its own unit, so it does not silently join a set.
    expect(magnitudes(['68%', '32'])).toBeUndefined();
  });

  it('still compares values that share a unit', () => {
    expect(magnitudes(['3 万人', '500 人'])).toEqual([1, 500 / 30_000]);
    expect(magnitudes(['68%', '32%'])).toEqual([1, 32 / 68]);
  });
});

describe('unitOf', () => {
  it('reads the unit the quantity is measured in', () => {
    expect(unitOf('32华氏度')).toBe('华氏度');
    expect(unitOf('1%')).toBe('%');
    expect(unitOf('3.5 倍')).toBe('倍');
    expect(unitOf('约 42 分钟')).toBe('分钟');
  });

  it('treats a bare number as its own unit', () => {
    expect(unitOf('500')).toBe('');
  });

  it('consumes a scale word rather than reporting it', () => {
    // "3 万人" and "500 人" are the same unit at different scales; magnitude
    // has already folded the scale into the value.
    expect(unitOf('3 万人')).toBe('人');
    expect(unitOf('12K')).toBe('');
  });

  it('stops at the separator before an aside', () => {
    expect(unitOf('110 年 · 第 3 万 次')).toBe('年');
  });

  it('is undefined when there is no quantity to attach a unit to', () => {
    expect(unitOf('几乎没有')).toBeUndefined();
  });
});

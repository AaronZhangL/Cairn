import { describe, expect, test } from 'bun:test';
import { boostedRate, clampVolume, nextRate, RATES, seekDistance } from '../src/panes/useTransport';

describe('seekDistance', () => {
  test('1 倍速点一下跳 5 秒', () => expect(seekDistance(1)).toBe(5));
  test('2 倍速点一下跳 10 秒', () => expect(seekDistance(2)).toBe(10));
  test('0.75 倍速跳得更近', () => expect(seekDistance(0.75)).toBeLessThan(5));
  test('与倍速成正比', () => {
    expect(seekDistance(3) / seekDistance(1)).toBe(3);
  });
});

describe('boostedRate', () => {
  test('长按在当前倍速上翻倍', () => expect(boostedRate(1)).toBe(2));
  test('已经 2 倍速时长按仍然加速 —— 不能毫无反应', () => {
    expect(boostedRate(2)).toBeGreaterThan(2);
  });
  test('封顶，不会快到听不清', () => expect(boostedRate(3)).toBe(4));
  test('任何档位长按都真的变快', () => {
    for (const r of RATES) expect(boostedRate(r)).toBeGreaterThan(r);
  });
});

describe('nextRate', () => {
  test('按档位依次前进', () => expect(nextRate(1)).toBe(1.25));
  test('末档回到首档', () => expect(nextRate(RATES[RATES.length - 1]!)).toBe(RATES[0]));
  test('循环一圈回到原点', () => {
    let r: number = RATES[0]!;
    for (let i = 0; i < RATES.length; i += 1) r = nextRate(r);
    expect(r).toBe(RATES[0]);
  });
  test('档位递增且包含 1 倍速', () => {
    expect([...RATES]).toEqual([...RATES].sort((a, b) => a - b));
    expect(RATES).toContain(1);
  });
});

describe('clampVolume', () => {
  test('keeps a level the element can accept', () => {
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.42)).toBe(0.42);
    expect(clampVolume(1)).toBe(1);
  });

  /** ↑ at full volume and ↓ at silence both overshoot the range by a step. */
  test('clamps what the keyboard steps past the ends', () => {
    expect(clampVolume(1.1)).toBe(1);
    expect(clampVolume(-0.1)).toBe(0);
  });

  test('a non-number falls back to audible rather than silent', () => {
    expect(clampVolume(Number.NaN)).toBe(1);
  });
});

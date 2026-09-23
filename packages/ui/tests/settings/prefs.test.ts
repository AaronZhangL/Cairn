import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_PREFS, parseStored, TEXT_SCALE, withPref,
} from '../../src/settings/prefs';

describe('parseStored', () => {
  test('nothing stored yet falls back whole', () => {
    expect(parseStored(null)).toEqual(DEFAULT_PREFS);
  });

  test('the default locale is English, not the browser’s', () => {
    expect(DEFAULT_PREFS.locale).toBe('en');
  });

  test('keeps a complete, valid record', () => {
    const stored = {
      locale: 'zh', theme: 'dark', textSize: 'l', rate: 1.5, autoNext: false, resume: false,
    };
    expect(parseStored(JSON.stringify(stored))).toEqual(stored as never);
  });

  test('a partial record keeps its valid fields and defaults the rest', () => {
    const prefs = parseStored(JSON.stringify({ theme: 'dark' }));
    expect(prefs.theme).toBe('dark');
    expect(prefs.locale).toBe(DEFAULT_PREFS.locale);
    expect(prefs.rate).toBe(DEFAULT_PREFS.rate);
  });

  // Each of these was written by some build of this app, or by a hand in devtools
  test.each([
    ['not json at all', '{oops'],
    ['a bare string', '"dark"'],
    ['null', 'null'],
    ['an array', '[1,2,3]'],
  ])('%s falls back rather than throwing', (_name, raw) => {
    expect(parseStored(raw)).toEqual(DEFAULT_PREFS);
  });

  test('an unknown locale does not become the interface language', () => {
    expect(parseStored(JSON.stringify({ locale: 'fr' })).locale).toBe(DEFAULT_PREFS.locale);
  });

  test.each([
    ['a theme this build dropped', { theme: 'sepia' }, 'theme'],
    ['a text size that never existed', { textSize: 'huge' }, 'textSize'],
  ])('%s is ignored', (_name, stored, key) => {
    const prefs = parseStored(JSON.stringify(stored));
    expect(prefs[key as 'theme' | 'textSize']).toBe(DEFAULT_PREFS[key as 'theme' | 'textSize']);
  });

  /**
   * A rate off the ladder cannot be reached by the transport, so honouring one
   * would leave a speed the reader can hear but not change back.
   */
  test.each([0, -1, 7, Number.NaN, Number.POSITIVE_INFINITY])(
    'a rate of %p is not honoured',
    (rate) => {
      expect(parseStored(JSON.stringify({ rate })).rate).toBe(DEFAULT_PREFS.rate);
    },
  );

  test('a rate on the ladder is', () => {
    expect(parseStored(JSON.stringify({ rate: 2 })).rate).toBe(2);
  });

  test('a non-boolean switch does not read as off', () => {
    expect(parseStored(JSON.stringify({ autoNext: 'yes' })).autoNext).toBe(DEFAULT_PREFS.autoNext);
  });
});

describe('withPref', () => {
  test('returns a new object and leaves the original alone', () => {
    const next = withPref(DEFAULT_PREFS, 'theme', 'dark');
    expect(next.theme).toBe('dark');
    expect(DEFAULT_PREFS.theme).toBe('system');
    expect(next).not.toBe(DEFAULT_PREFS);
  });
});

describe('TEXT_SCALE', () => {
  test('medium is exactly 1, so the default changes nothing', () => {
    expect(TEXT_SCALE.m).toBe(1);
  });

  test('rises with size', () => {
    expect(TEXT_SCALE.s).toBeLessThan(TEXT_SCALE.m);
    expect(TEXT_SCALE.m).toBeLessThan(TEXT_SCALE.l);
    expect(TEXT_SCALE.l).toBeLessThan(TEXT_SCALE.xl);
  });
});

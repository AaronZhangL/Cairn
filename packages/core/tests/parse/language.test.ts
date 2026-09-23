import { describe, expect, test } from 'bun:test';
import {
  detectContentLocale, localeFromTag, localeFromText,
} from '../../src/parse/language';

describe('localeFromTag', () => {
  test.each([
    ['zh', 'zh'], ['zh-CN', 'zh'], ['zh-Hans-CN', 'zh'], ['ZH_TW', 'zh'],
    ['en', 'en'], ['en-GB', 'en'], ['EN-US', 'en'],
  ])('%s reads as %s', (tag, expected) => {
    expect(localeFromTag(tag)).toBe(expected as 'en' | 'zh');
  });

  // Nothing rather than a guess: the caller then counts the text instead
  test.each([undefined, '', '   ', 'ja', 'fr-FR', 'und'])('%p yields nothing', (tag) => {
    expect(localeFromTag(tag)).toBeUndefined();
  });
});

describe('localeFromText', () => {
  test('plain Chinese', () => {
    expect(localeFromText('地方政府的土地财政，本质上是把未来几十年的地租折现到今天。')).toBe('zh');
  });

  test('plain English', () => {
    expect(localeFromText('A chapter that cannot make one thing clear is worth nothing.')).toBe('en');
  });

  /**
   * The case a presence test gets wrong. An English book quoting a Chinese
   * phrase is still an English book, and narrating it in Chinese would be the
   * failure this whole split exists to prevent.
   */
  test('an English book with a Chinese quotation stays English', () => {
    const text = `${'The author cites the phrase 实事求是 once. '.repeat(20)}`;
    expect(localeFromText(text)).toBe('en');
  });

  test('a Chinese book with English terms stays Chinese', () => {
    const text = `${'这一章讨论 land finance 的起点，以及它与 GDP 的关系。'.repeat(20)}`;
    expect(localeFromText(text)).toBe('zh');
  });

  test('no letters at all falls back rather than throwing', () => {
    expect(localeFromText('12345 ——— !!!')).toBe('en');
  });
});

describe('detectContentLocale', () => {
  const chinese = '地方政府的土地财政，本质上是把未来几十年的地租折现到今天。'.repeat(20);
  const english = 'A chapter that cannot make one thing clear is worth nothing. '.repeat(20);

  /**
   * The regression this function exists for: conversion tools routinely stamp
   * `dc:language=en` on a Chinese translation. Honouring that would narrate the
   * whole book in the wrong voice, and the reader only finds out after paying
   * for every station.
   */
  test('a lying manifest loses to the text', () => {
    expect(detectContentLocale('en', chinese)).toBe('zh');
    expect(detectContentLocale('zh', english)).toBe('en');
  });

  test('an agreeing manifest changes nothing', () => {
    expect(detectContentLocale('zh', chinese)).toBe('zh');
    expect(detectContentLocale('en', english)).toBe('en');
  });

  test('no manifest at all still works', () => {
    expect(detectContentLocale(undefined, chinese)).toBe('zh');
  });

  /** Too little text to count, so the declared tag is the better of the two. */
  test('a short sample defers to the manifest', () => {
    expect(detectContentLocale('zh', 'Preface')).toBe('zh');
  });

  test('a short sample with no usable manifest still answers', () => {
    expect(detectContentLocale('ja', '序')).toBe('zh');
  });
});

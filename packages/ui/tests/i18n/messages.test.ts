import { describe, expect, test } from 'bun:test';
import type { ErrorCode, ErrorPayload } from '@cairn/core/errors';
import { detectLocale, format, LOCALES, parseLocale } from '../../src/i18n/locale';
import { messagesFor } from '../../src/i18n';
import { errorText } from '../../src/i18n/errorText';

describe('parseLocale', () => {
  test.each(LOCALES)('keeps %s', (locale) => {
    expect(parseLocale(locale)).toBe(locale);
  });

  test.each([undefined, null, 42, 'fr', '', {}])('%p falls back to English', (raw) => {
    expect(parseLocale(raw)).toBe('en');
  });
});

describe('detectLocale', () => {
  test('matches on the base tag, not the whole one', () => {
    expect(detectLocale(['zh-Hans-CN'])).toBe('zh');
    expect(detectLocale(['en-GB'])).toBe('en');
  });

  test('walks the list in order', () => {
    expect(detectLocale(['fr-FR', 'zh-CN'])).toBe('zh');
  });

  test('nothing supported yields nothing, rather than guessing', () => {
    expect(detectLocale(['fr', 'de'])).toBeUndefined();
  });
});

describe('format', () => {
  test('fills named holes', () => {
    expect(format('{n} of {total}', { n: 2, total: 9 })).toBe('2 of 9');
  });

  test('leaves a hole nobody filled, rather than printing undefined', () => {
    expect(format('{a} {b}', { a: 1 })).toBe('1 {b}');
  });
});

/**
 * The guard against the two dictionaries drifting. The typecheck already fails
 * on a *missing* key; this catches the other half — a key present but empty,
 * which types fine and renders as nothing on screen.
 */
describe('dictionaries', () => {
  const walk = (value: unknown, path: string, out: string[]): void => {
    if (typeof value === 'string') {
      if (value.trim() === '') out.push(path);
      return;
    }
    if (typeof value === 'function') return;
    if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`, out);
    }
  };

  test.each(LOCALES)('%s has no empty strings', (locale) => {
    const empty: string[] = [];
    walk(messagesFor(locale), locale, empty);
    expect(empty).toEqual([]);
  });

  test('both locales have exactly the same keys', () => {
    const keys = (value: unknown, path = ''): string[] => {
      if (typeof value !== 'object' || value === null) return [path];
      return Object.entries(value).flatMap(([k, v]) => keys(v, `${path}.${k}`));
    };
    expect(keys(messagesFor('zh')).sort()).toEqual(keys(messagesFor('en')).sort());
  });
});

describe('errorText', () => {
  const payload = (code: ErrorCode, params = {}, detail?: string): ErrorPayload =>
    ({ code, params, ...(detail ? { detail } : {}) });

  test.each(LOCALES)('%s words a plain code', (locale) => {
    const text = errorText(payload('tts_missing'), messagesFor(locale));
    // A sentence, not the code echoed back — which is what a missing key gives
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('tts_missing');
  });

  test('fills a code that takes values', () => {
    const text = errorText(payload('unsupported_format', { ext: 'pdf', accepted: '.epub' }), messagesFor('en'));
    expect(text).toContain('pdf');
    expect(text).toContain('.epub');
  });

  /**
   * An older shell talking to a newer player is a real combination. Showing the
   * raw code would be worse than a generic sentence — this is the regression
   * guard for that.
   */
  test('an unknown code never renders as the code itself', () => {
    const text = errorText(payload('not_a_real_code' as ErrorCode, {}, 'boom'), messagesFor('en'));
    expect(text).not.toContain('not_a_real_code');
    expect(text).toContain('boom');
  });

  test('a known code does not have its technical tail appended', () => {
    const text = errorText(payload('tts_failed', {}, 'stderr noise'), messagesFor('en'));
    expect(text).not.toContain('stderr noise');
  });
});

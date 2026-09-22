import { describe, expect, test } from 'bun:test';
import { fingerprint } from '../../src/pipeline/fingerprint';

describe('fingerprint', () => {
  test('is stable across runs', () => {
    expect(fingerprint({ a: 1, b: [2, 3] })).toBe(fingerprint({ a: 1, b: [2, 3] }));
  });

  test('ignores property order', () => {
    expect(fingerprint({ a: 1, b: 2 })).toBe(fingerprint({ b: 2, a: 1 }));
  });

  test('respects array order, which is meaningful', () => {
    expect(fingerprint([1, 2])).not.toBe(fingerprint([2, 1]));
  });

  test('changes when any value changes', () => {
    const base = { title: '第一站', chapters: [0, 1], minutes: 3 };
    expect(fingerprint({ ...base, title: '第二站' })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, chapters: [0, 2] })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, minutes: 4 })).not.toBe(fingerprint(base));
  });

  test('distinguishes a missing key from an explicit undefined', () => {
    // Both mean "absent", so they must agree — otherwise an optional field that
    // is sometimes omitted would invalidate the cache for no reason
    expect(fingerprint({ a: 1, b: undefined })).toBe(fingerprint({ a: 1 }));
  });

  test('distinguishes null from absent', () => {
    expect(fingerprint({ a: 1, b: null })).not.toBe(fingerprint({ a: 1 }));
  });

  test('handles CJK and nesting', () => {
    const value = { 标题: '微习惯的力量', 要点: ['复利', '身份'], 嵌套: { 深: true } };
    expect(fingerprint(value)).toBe(fingerprint(structuredClone(value)));
    expect(fingerprint(value)).toHaveLength(16);
  });

  test('is 16 hex characters', () => {
    expect(fingerprint('anything')).toMatch(/^[0-9a-f]{16}$/);
  });
});

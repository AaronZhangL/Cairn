import { describe, expect, test } from 'bun:test';
import { CitationError, validateCitations } from '../../src/companion/citations';
import type { Citation, EvidenceRecord } from '../../src/companion/types';

const evidence: readonly EvidenceRecord[] = [
  { resultId: 'r1', source: 'book', refs: [{ chapter: 2, title: '第二章' }] },
  { resultId: 'r2', source: 'web', refs: [{ url: 'https://example.org/a', title: 'Article' }] },
  { resultId: 'r3', source: 'shelf', refs: [{ bookId: 'old', bookTitle: 'Old', nodeId: 'n1', nodeTitle: 'Idea' }] },
];

const citation: Citation = {
  span: [0, 4], source: 'book', resultId: 'r1', ref: { chapter: 2, title: '第二章' },
};

describe('validateCitations', () => {
  test('accepts a span grounded in a returned result', () => {
    expect(validateCitations('一个观点。', [citation], evidence)).toEqual([citation]);
  });

  test('rejects a result that was never returned', () => {
    expect(() => validateCitations('一个观点。', [{ ...citation, resultId: 'unknown' }], evidence))
      .toThrow(CitationError);
  });

  test('rejects a chapter not present in the named result', () => {
    expect(() => validateCitations('一个观点。', [{ ...citation, ref: { chapter: 3, title: '第三章' } }], evidence))
      .toThrow(CitationError);
  });

  test('rejects a source type that differs from the result', () => {
    expect(() => validateCitations('一个观点。', [{ ...citation, source: 'web' }], evidence))
      .toThrow(CitationError);
  });

  test('rejects spans outside the final answer', () => {
    expect(() => validateCitations('short', [{ ...citation, span: [0, 8] }], evidence))
      .toThrow(CitationError);
  });
});

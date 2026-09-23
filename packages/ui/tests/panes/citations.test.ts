import { expect, test } from 'bun:test';
import { citationParts } from '../../src/panes/CompanionPane';
import type { Citation } from '@cairn/core/companion/types';

test('places source links after cited spans without changing answer text', () => {
  const citations: Citation[] = [
    { span: [0, 8], source: 'book', resultId: 'r1', ref: { chapter: 2, title: 'Two' } },
    { span: [9, 15], source: 'web', resultId: 'r2', ref: { url: 'https://example.org', title: 'Page' } },
  ];
  const parts = citationParts('A claim. And web.', citations);
  expect(parts.map((part) => part.text).join('')).toBe('A claim. And web.');
  expect(parts.map((part) => part.citations.length)).toEqual([1, 1, 0]);
});

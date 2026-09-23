import { describe, expect, test } from 'bun:test';
import type { EvidenceRecord } from '@cairn/core/companion/types';
import { availableEvidence, chapterExcerpts, citationMarkers, CompanionRunError, makeClarification, shouldRetryOverflow, verifyBookQuotes } from '../../../src/main/companion/run';

const evidence: EvidenceRecord[] = [
  { resultId: 'book-1', source: 'book', refs: [{ chapter: 2, title: 'Second' }] },
  { resultId: 'web-1', source: 'web', refs: [{ url: 'https://example.com', title: 'Example' }] },
];

describe('citationMarkers', () => {
  test('removes markers and attaches the cited sentence to actual tool evidence', () => {
    const answer = citationMarkers('A thought. The book says so [[cite:book-1:0]]. And the page agrees [[cite:web-1:0]].', evidence);
    expect(answer.text).toBe('A thought. The book says so. And the page agrees.');
    expect(answer.citations).toEqual([
      { span: [11, 27], source: 'book', resultId: 'book-1', ref: { chapter: 2, title: 'Second' } },
      { span: [29, 48], source: 'web', resultId: 'web-1', ref: { url: 'https://example.com', title: 'Example' } },
    ]);
  });

  test('does not accept an invented result or reference', () => {
    expect(() => citationMarkers('Claim [[cite:fake:0]]', evidence)).toThrow(CompanionRunError);
    expect(() => citationMarkers('Claim [[cite:book-1:1]]', evidence)).toThrow(CompanionRunError);
  });

  test('attaches a marker placed after sentence punctuation', () => {
    const answer = citationMarkers('The book says so. [[cite:book-1:0]] Next thought.', evidence);
    expect(answer.text).toBe('The book says so. Next thought.');
    expect(answer.citations[0]?.span).toEqual([0, 17]);
  });

  test('keeps quotation punctuation inside the cited span', () => {
    const answer = citationMarkers('It says “A thought.” [[cite:book-1:0]]', evidence);
    expect(answer.citations[0]?.span).toEqual([0, answer.text.length]);
  });
});

describe('verifyBookQuotes', () => {
  const chapters = new Map([['book-1', new Map([[2, 'The sentence is A thought. And then another.']])]]);

  test('accepts an exact quote from a chapter fetched this turn', () => {
    const answer = citationMarkers('It says “A thought.” [[cite:book-1:0]]', evidence);
    expect(() => verifyBookQuotes(answer.text, answer.citations, chapters)).not.toThrow();
  });

  test('rejects fabricated quotes and note-only citations', () => {
    const answer = citationMarkers('It says “Made up.” [[cite:book-1:0]]', evidence);
    expect(() => verifyBookQuotes(answer.text, answer.citations, chapters)).toThrow(CompanionRunError);
    expect(() => verifyBookQuotes(answer.text, answer.citations, new Map())).toThrow(CompanionRunError);
  });

  test('only accepts the exact excerpt sent to the model, not unseen chapter text', () => {
    const fetched = chapterExcerpts('<tool_result><chapter idx="2" title="Second" truncated="true">A &amp; B</chapter></tool_result>');
    expect(fetched.get(2)).toBe('A & B');
    const answer = citationMarkers('It says “unseen sentence” [[cite:book-1:0]]', evidence);
    expect(() => verifyBookQuotes(answer.text, answer.citations, new Map([['book-1', fetched]]))).toThrow(CompanionRunError);
  });

  test('rejects a quotation attributed to the book without a book citation', () => {
    expect(() => verifyBookQuotes('The book says “A fabricated sentence.”', [], chapters)).toThrow(CompanionRunError);
    expect(() => verifyBookQuotes('A term like “agent loop” is useful.', [], chapters)).not.toThrow();
    expect(() => verifyBookQuotes('The book is complex. A term like “agent loop” is useful.', [], chapters)).not.toThrow();
  });
});

test('archived evidence with no retained tool result cannot be cited', () => {
  const archived = {
    pathGeneratedAt: 'generation-1',
    messages: [{ id: 'user-1', role: 'user' as const, text: 'Question', at: 'now' }],
    evidence,
  };
  const available = availableEvidence(archived, 0, []);
  expect(available).toEqual([]);
  expect(() => citationMarkers('Claim [[cite:book-1:0]]', available)).toThrow(CompanionRunError);
});

test('retries a provider context overflow only once, not unrelated errors', () => {
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const message = {
    role: 'assistant' as const, api: 'openai-completions' as const, provider: 'test', model: 'test',
    content: [], usage, stopReason: 'error' as const, timestamp: 0,
    errorMessage: 'Your input exceeds the context window of this model',
  };
  expect(shouldRetryOverflow(message, 8192, 1)).toBe(true);
  expect(shouldRetryOverflow(message, 8192, 2)).toBe(false);
  expect(shouldRetryOverflow({ ...message, errorMessage: 'rate limit' }, 8192, 1)).toBe(false);
});

test('clarification becomes a normal persisted assistant question with choices', () => {
  const message = makeClarification('  Which edition?  ', [' First ', 'Second'], 'at');
  expect(message).toMatchObject({ role: 'assistant', text: 'Which edition?', options: ['First', 'Second'], citations: [] });
  expect(() => makeClarification(' ', [], 'at')).toThrow(CompanionRunError);
});

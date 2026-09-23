import { expect, test } from 'bun:test';
import { applyCompanionEvent, beginCompanionTurn, emptyCompanionView } from '../src/companion-state';

test('late events from another book or turn do not overwrite the active chat', () => {
  const current = beginCompanionTurn(emptyCompanionView('book-a'), 'turn-a', 'Question');
  const old = applyCompanionEvent(current, { bookId: 'book-b', turnId: 'turn-b', type: 'draft', text: 'Old' });
  expect(old).toBe(current);
  const otherTurn = applyCompanionEvent(current, { bookId: 'book-a', turnId: 'turn-b', type: 'draft', text: 'Old' });
  expect(otherTurn).toBe(current);
});

test('a failed draft remains provisional and never becomes an assistant message', () => {
  const start = beginCompanionTurn(emptyCompanionView('book-a'), 'turn-a', 'Question');
  const draft = applyCompanionEvent(start, { bookId: 'book-a', turnId: 'turn-a', type: 'draft', text: 'Possibly...' });
  const failed = applyCompanionEvent(draft, { bookId: 'book-a', turnId: 'turn-a', type: 'error', code: 'model_failed', message: 'Failed' });
  expect(failed.pendingTurn).toBeUndefined();
  expect(failed.draft).toBeUndefined();
  expect(failed.messages.map((item) => item.role)).toEqual(['user']);
});

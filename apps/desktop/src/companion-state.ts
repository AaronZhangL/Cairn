import type { ChatMessage } from '@cairn/core/companion/types';
import type { CompanionEvent } from './main/companion/events';

export interface CompanionViewState {
  readonly bookId: string;
  readonly messages: readonly ChatMessage[];
  readonly pendingTurn?: string;
  readonly draft?: string;
  readonly error?: string;
  readonly errorCode?: string;
}

export function emptyCompanionView(bookId: string): CompanionViewState {
  return { bookId, messages: [] };
}

export function beginCompanionTurn(
  state: CompanionViewState, turnId: string, question: string, selection?: string, atNode?: string,
): CompanionViewState {
  const user: ChatMessage = { id: turnId, role: 'user', text: question, at: new Date().toISOString(), selection, atNode };
  return { ...state, messages: [...state.messages, user], pendingTurn: turnId, draft: undefined, error: undefined, errorCode: undefined };
}

export function applyCompanionEvent(state: CompanionViewState, event: CompanionEvent): CompanionViewState {
  if (event.bookId !== state.bookId || event.turnId !== state.pendingTurn) return state;
  if (event.type === 'draft') return { ...state, draft: event.text };
  if (event.type === 'error') return { ...state, pendingTurn: undefined, draft: undefined, error: event.message, errorCode: event.code };
  if (event.type === 'final') {
    return { ...state, messages: [...state.messages, event.message], pendingTurn: undefined, draft: undefined, error: undefined, errorCode: undefined };
  }
  if (event.status === 'start') {
    const tool: ChatMessage = {
      id: `${event.turnId}:tool:${state.messages.length}`, role: 'tool', name: event.name,
      resultId: '', text: '', at: new Date().toISOString(),
    };
    return { ...state, messages: [...state.messages, tool], draft: undefined };
  }
  return state;
}

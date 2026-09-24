import type { ChatMessage } from '@cairn/core/companion/types';
import type { UiLocale } from '../../shared/settings';

export type AssistantChatMessage = Extract<ChatMessage, { readonly role: 'assistant' }>;

export interface RunTurnInput {
  readonly turnId: string;
  readonly bookId: string;
  readonly nodeId?: string;
  readonly question: string;
  /** The interface's language, which is the one the reader is asking in. */
  readonly locale: UiLocale;
  readonly selection?: string;
  readonly signal?: AbortSignal;
}

interface EventBase {
  readonly turnId: string;
  readonly bookId: string;
}

export type CompanionEventPayload =
  | { readonly type: 'draft'; readonly text: string }
  | { readonly type: 'tool'; readonly name: string; readonly status: 'start' | 'end' | 'error'; readonly text?: string }
  | { readonly type: 'final'; readonly message: AssistantChatMessage }
  | { readonly type: 'error'; readonly code: string; readonly message: string };

export type CompanionEvent = EventBase & CompanionEventPayload;

export type EmitCompanionEvent = (event: CompanionEvent) => void | Promise<void>;

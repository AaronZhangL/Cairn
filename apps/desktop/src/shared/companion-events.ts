import type { ChatMessage } from '@cairn/core/companion/types';
import type { RequestParams } from './schema';

export type AssistantChatMessage = Extract<ChatMessage, { readonly role: 'assistant' }>;

/** What the webview sent, plus the cancellation only the main process holds. */
export type RunTurnInput = RequestParams<'chatSend'> & { readonly signal?: AbortSignal };

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

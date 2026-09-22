import type { RPCSchema } from 'electrobun/view';
import type { Answer } from '@cairn/core/pipeline/ask';
import type { OutsideAnswer } from '@cairn/core/pipeline/ask-outside';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import type { LibraryEntry } from '@cairn/core/store/library';
import type { BookPreview, DeckStatus, Progress } from './types';

/**
 * The bridge contract, shared by both sides so they cannot drift.
 *
 * Generation is a request that can run for minutes, so its progress comes back
 * as a one-way message rather than being folded into the response.
 */
export type BunSchema = RPCSchema<{
  requests: {
    libraryBase: { params: void; response: string };
    progressNow: { params: void; response: Progress | null };
    pickBook: { params: void; response: BookPreview | null };
    generateBook: { params: { filePath: string; budgetId: BudgetId }; response: LibraryEntry };
    ask: {
      params: { bookId: string; question: string; selection?: string; nodeId: string };
      response: Answer;
    };
    askOutside: { params: { question: string; bookTitle?: string }; response: OutsideAnswer };
    /**
     * Tell the builder which station the reader is on, so the next ones built
     * are the next ones they will reach.
     */
    focusStation: { params: { bookId: string; nodeId: string }; response: null };
    /** Pick a half-built book back up when it is opened. */
    resumeBook: { params: { bookId: string }; response: boolean };
  };
}>;

/**
 * Messages are declared by the side that RECEIVES them: the bun side's outgoing
 * `send` is typed from this schema, and so is the webview's listener.
 */
export type WebviewSchema = RPCSchema<{
  requests: Record<never, never>;
  messages: { progress: Progress; deckStatus: DeckStatus };
}>;

export type CairnRPC = { bun: BunSchema; webview: WebviewSchema };
export type { BookPreview, DeckStatus, Progress };

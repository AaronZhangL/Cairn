import type { RPCSchema } from 'electrobun/view';
import type { Answer } from '@cairn/core/pipeline/ask';
import type { OutsideAnswer } from '@cairn/core/pipeline/ask-outside';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import type { LibraryEntry } from '@cairn/core/store/library';
import type { ContentLocale, ModelStatus, ShellSettingsValues, UiLocale } from './settings';
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
    /** Remove a book, its decks, its audio and its cache. Irreversible. */
    deleteBook: { params: { bookId: string }; response: boolean };

    /* ---- settings the main process owns; the renderer's own live in localStorage ---- */
    getSettings: { params: void; response: ShellSettingsValues };
    setSettings: { params: Partial<ShellSettingsValues>; response: ShellSettingsValues };
    /** The library path, for showing and for revealing in Finder. */
    dataDir: { params: void; response: string };
    /** `recheck` drops the memoised edge-tts lookup before answering. */
    engineStatus: {
      params: { recheck?: boolean };
      response: { found: boolean; path?: string };
    };
    /** Writes a sample under the library root and returns its relative path. */
    previewVoice: { params: { locale: ContentLocale }; response: string };
    revealDataDir: { params: void; response: null };
    /** Throws away everything derived from the books, keeping the books. */
    clearCache: { params: void; response: null };
    /**
     * The menu bar is drawn by the OS, so its words cannot come from the
     * renderer's dictionary. The webview tells the main process which language
     * it is in and the menu is rebuilt in place.
     */
    setMenuLocale: { params: { locale: UiLocale }; response: null };
    /** Which model route the current settings resolve to, and whether it can run. */
    modelStatus: { params: void; response: ModelStatus };
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

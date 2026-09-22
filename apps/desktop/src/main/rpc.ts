/**
 * RPC handlers.
 *
 * `ask` and `askOutside` stay separate on purpose: `ask` never touches the
 * network, and `askOutside` only runs once the reader has said yes. Merging them
 * would let the model decide to leave the book on its own.
 */
import { openFileDialog } from 'electrobun/main/utils';
import { askAnchored, askBook, noteIndexLocator } from '@cairn/core/pipeline/ask';
import { askOutside as askWeb } from '@cairn/core/pipeline/ask-outside';
import { codexCliProvider } from '@cairn/core/llm';
import { ACCEPTED_EXTENSIONS } from '@cairn/core/parse';
import type { Answer } from '@cairn/core/pipeline/ask';
import type { OutsideAnswer } from '@cairn/core/pipeline/ask-outside';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import { isRecap } from '@cairn/core/pipeline/recap';
import type { LibraryEntry } from '@cairn/core/store/library';
import { tavily } from './tavily';
import { library } from './library';
import { loadChapter, loadNotes, loadPath } from './store';
import type { BookPreview, Progress } from '../shared/types';
import { generate, inspect } from './generate';

const provider = codexCliProvider();

/** Set by index.ts so generation can stream progress to the open window. */
let emitProgress: (p: Progress) => void = () => undefined;
export function onProgress(fn: (p: Progress) => void): void {
  emitProgress = fn;
}

/**
 * The last progress of the run in flight.
 *
 * Pushed messages are the fast path, but they are fire-and-forget: a reloaded
 * window, or a dropped message, leaves the modal frozen for the rest of a run
 * that takes minutes. Keeping the value here lets the window ask instead.
 */
let latest: Progress | undefined;

export const handlers = {
  /** Where the webview reads generated books from. Token included; do not log it. */
  async libraryBase(): Promise<string> {
    return library().base;
  },

  /** Where the run in flight has got to, or nothing when none is running. */
  async progressNow(): Promise<Progress | null> {
    return latest ?? null;
  },

  /** Native picker, then a parse-only preview so the budget choice is informed. */
  async pickBook(): Promise<BookPreview | null> {
    const [picked] = await openFileDialog({
      allowedFileTypes: ACCEPTED_EXTENSIONS.map((e) => e.slice(1)).join(','),
      canChooseFiles: true,
      canChooseDirectory: false,
    });
    return picked ? inspect(picked) : null;
  },

  async generateBook(params: { filePath: string; budgetId: BudgetId }): Promise<LibraryEntry> {
    latest = { stage: 'map', done: 0, total: 1 };
    try {
      return await generate(params.filePath, params.budgetId, (p) => {
        latest = p;
        emitProgress(p);
      });
    } finally {
      latest = undefined;
    }
  },

  async ask(params: {
    bookId: string; question: string; selection?: string; nodeId: string;
  }): Promise<Answer> {
    const { nodes } = await loadPath(params.bookId);
    const node = nodes.find((n) => n.id === params.nodeId);
    if (!node) throw new Error(`未知站点 ${params.nodeId}`);

    // A highlighted passage already points at its chapters — nothing to search for.
    // Except on the recap station, whose sources are the whole book: loading them
    // all would put every chapter into one prompt. There the highlight rides along
    // with the question and the locator picks the chapters.
    if (params.selection && !isRecap(node)) {
      const chapters = (await Promise.all(
        node.sourceChapters.map((i) => loadChapter(params.bookId, i)),
      )).filter((c) => c !== undefined);
      return askAnchored(
        { question: params.question, selection: params.selection, node, chapters },
        provider,
      );
    }

    return askBook({
      question: params.selection
        ? `读者划中的原文：「${params.selection}」\n\n问题：${params.question}`
        : params.question,
      locator: noteIndexLocator(await loadNotes(params.bookId), provider),
      loadChapter: (idx) => loadChapter(params.bookId, idx),
    }, provider);
  },

  async askOutside(params: { question: string; bookTitle?: string }): Promise<OutsideAnswer> {
    return askWeb(params, tavily(), provider);
  },
};

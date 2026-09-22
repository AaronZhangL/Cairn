/**
 * RPC handlers.
 *
 * `ask` and `askOutside` stay separate on purpose: `ask` never touches the
 * network, and `askOutside` only runs once the reader has said yes. Merging them
 * would let the model decide to leave the book on its own.
 */
import { openFileDialog } from 'electrobun/main/utils';
import { askAnchored, askBook, noteIndexLocator, singleBook } from '@cairn/core/pipeline/ask';
import { askOutside as askWeb } from '@cairn/core/pipeline/ask-outside';
import { ACCEPTED_EXTENSIONS } from '@cairn/core/parse';
import type { Answer } from '@cairn/core/pipeline/ask';
import type { OutsideAnswer } from '@cairn/core/pipeline/ask-outside';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import { isRecap } from '@cairn/core/pipeline/recap';
import type { LibraryEntry } from '@cairn/core/store/library';
import { tavily } from './tavily';
import { library } from './library';
import { loadChapter, loadNotes, loadPath } from './store';
import { plain } from './provider';
import { recordAsk } from './asks';
import type { BookPreview, Progress } from '../shared/types';
import {
  generate, inspect, listBooks, pauseBackgroundBuilds, resume, schedulerFor,
} from './generate';

const provider = plain;

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

/**
 * Run a reader-facing model call with background building held off.
 *
 * Prefetching stations and answering a question go through the same codex
 * process pool, and the reader is watching only one of the two. Holding is
 * per-call rather than global state so a failed question cannot wedge the
 * builder permanently.
 */
async function foreground<T>(work: () => Promise<T>): Promise<T> {
  const release = pauseBackgroundBuilds();
  try {
    return await work();
  } finally {
    release();
  }
}

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

  /**
   * The reader moved. Build what they are about to reach, not what comes next
   * in the path they have already walked past.
   */
  async focusStation(params: { bookId: string; nodeId: string }): Promise<null> {
    schedulerFor(params.bookId)?.focus(params.nodeId);
    return null;
  },

  /** Opening a half-built book restarts its builder where it stopped. */
  async resumeBook(params: { bookId: string }): Promise<boolean> {
    return resume(params.bookId).catch(() => false);
  },

  async ask(params: {
    bookId: string; question: string; selection?: string; nodeId: string;
  }): Promise<Answer> {
    const { nodes } = await loadPath(params.bookId);
    const node = nodes.find((n) => n.id === params.nodeId);
    if (!node) throw new Error(`未知站点 ${params.nodeId}`);

    const answer = await foreground(async () => {
      // A highlighted passage already points at its chapters — nothing to search
      // for. Except on the recap station, whose sources are the whole book:
      // loading them all would put every chapter into one prompt. There the
      // highlight rides along with the question and the locator picks chapters.
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
        locator: noteIndexLocator(singleBook(await loadNotes(params.bookId)), provider),
        loadChapter: (ref) => loadChapter(params.bookId, ref.chapter),
      }, provider);
    });

    // Where the reader stopped to ask is the closest thing to a quality signal
    // this tool has; a station asked about repeatedly did not make itself clear.
    await recordAsk(params.bookId, {
      at: new Date().toISOString(),
      nodeId: node.id,
      question: params.question,
      grounded: answer.grounded,
    });

    return answer;
  },

  async askOutside(params: { question: string; bookTitle?: string }): Promise<OutsideAnswer> {
    return foreground(() => askWeb(params, tavily(), provider));
  },
};

export { listBooks };

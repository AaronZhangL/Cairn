/**
 * RPC handlers.
 *
 * `ask` and `askOutside` stay separate on purpose: `ask` never touches the
 * network, and `askOutside` only runs once the reader has said yes. Merging them
 * would let the model decide to leave the book on its own.
 */
import { openFileDialog } from 'electrobun/main/utils';
import { askAnchored, askBook, noteIndexLocator } from '@vibe/core/pipeline/ask';
import { askOutside as askWeb } from '@vibe/core/pipeline/ask-outside';
import { codexCliProvider } from '@vibe/core/llm';
import { ACCEPTED_EXTENSIONS } from '@vibe/core/parse';
import type { Answer } from '@vibe/core/pipeline/ask';
import type { OutsideAnswer } from '@vibe/core/pipeline/ask-outside';
import type { BudgetId } from '@vibe/core/pipeline/budget';
import type { LibraryEntry } from '@vibe/core/store/library';
import { tavily } from './tavily';
import { loadChapter, loadNotes, loadPath } from './store';
import type { BookPreview, Progress } from '../shared/types';
import { generate, inspect } from './generate';

const provider = codexCliProvider();

/** Set by index.ts so generation can stream progress to the open window. */
let emitProgress: (p: Progress) => void = () => undefined;
export function onProgress(fn: (p: Progress) => void): void {
  emitProgress = fn;
}

export const handlers = {
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
    return generate(params.filePath, params.budgetId, emitProgress);
  },

  async ask(params: {
    bookId: string; question: string; selection?: string; nodeId: string;
  }): Promise<Answer> {
    const { nodes } = await loadPath(params.bookId);
    const node = nodes.find((n) => n.id === params.nodeId);
    if (!node) throw new Error(`未知站点 ${params.nodeId}`);

    // A highlighted passage already points at its chapters — nothing to search for
    if (params.selection) {
      const chapters = (await Promise.all(
        node.sourceChapters.map((i) => loadChapter(params.bookId, i)),
      )).filter((c) => c !== undefined);
      return askAnchored(
        { question: params.question, selection: params.selection, node, chapters },
        provider,
      );
    }

    return askBook({
      question: params.question,
      locator: noteIndexLocator(await loadNotes(params.bookId), provider),
      loadChapter: (idx) => loadChapter(params.bookId, idx),
    }, provider);
  },

  async askOutside(params: { question: string; bookTitle?: string }): Promise<OutsideAnswer> {
    return askWeb(params, tavily(), provider);
  },
};

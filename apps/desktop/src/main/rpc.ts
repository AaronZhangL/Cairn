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
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { findEdgeTts, forgetEdgeTts, speakSample } from '@cairn/core/runtime';
import { effectiveTavilyKey, readSettings, writeSettings } from './settings';
import type {
  ContentLocale, ModelStatus, ShellSettingsValues, UiLocale,
} from '../shared/settings';
import { promptsFor } from '@cairn/core/pipeline/prompts';
import { installMenu } from './menu';
import { tavily } from './tavily';
import { library } from './library';
import { DATA_DIR, loadChapter, loadNotes, loadPath } from './store';
import { modelStatus, plainProvider } from './provider';
import { recordAsk } from './asks';
import type { BookPreview, Progress } from '../shared/types';
import {
  generate, inspect, listBooks, pauseBackgroundBuilds, removeBook, resume, schedulerFor,
} from './generate';
import { CairnError } from '@cairn/core/errors';
import { encodingErrors } from '../shared/errors';


const message = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

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

const rawHandlers = {
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

  /** Irreversible, and the reader has already confirmed it in the shelf. */
  async deleteBook(params: { bookId: string }): Promise<boolean> {
    try {
      const removed = await removeBook(params.bookId);
      if (!removed) throw new CairnError('book_not_listed', { id: params.bookId });
      return true;
    } catch (cause) {
      // The terminal gets the stack; the reader gets a code the player words.
      console.error('deleteBook failed', params.bookId, cause);
      if (cause instanceof CairnError) throw cause;
      throw new CairnError('delete_failed', { id: params.bookId }, message(cause));
    }
  },

  async ask(params: {
    bookId: string; question: string; selection?: string; nodeId: string;
  }): Promise<Answer> {
    // Answers are written in the book's language, not the reader's interface
    // language: the material being quoted back is the book's own text.
    const locale = await localeOfBook(params.bookId);
    const prompts = promptsFor(locale);
    const provider = await plainProvider();
    const { nodes } = await loadPath(params.bookId);
    const node = nodes.find((n) => n.id === params.nodeId);
    if (!node) throw new CairnError('unknown_node', { id: params.nodeId });

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
          locale,
        );
      }

      return askBook({
        question: params.selection
          ? prompts.ask.anchored(params.selection, params.question)
          : params.question,
        locator: noteIndexLocator(singleBook(await loadNotes(params.bookId)), provider, locale),
        loadChapter: (ref) => loadChapter(params.bookId, ref.chapter),
      }, provider, locale);
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
    const [search, provider] = await Promise.all([tavilySearch(), plainProvider()]);
    return foreground(() => askWeb(params, search, provider));
  },

  /* ---- settings ---- */

  async getSettings(): Promise<ShellSettingsValues> {
    return readSettings();
  },

  async setSettings(patch: Partial<ShellSettingsValues>): Promise<ShellSettingsValues> {
    return writeSettings(patch);
  },

  /** Where generated books live, as a path a human can read and open. */
  async dataDir(): Promise<string> {
    return DATA_DIR;
  },

  /**
   * Whether a voice can be spoken at all.
   * `recheck` drops the memoised lookup, so "I just installed it" is answerable
   * without restarting the app.
   */
  async engineStatus(params: { recheck?: boolean }): Promise<{ found: boolean; path?: string }> {
    if (params.recheck) forgetEdgeTts();
    const path = await findEdgeTts();
    return path ? { found: true, path } : { found: false };
  },

  /**
   * Audition a voice, in that voice's own language.
   *
   * The sample is never translated across languages: an English voice reading a
   * Chinese sentence is exactly the noise the per-language split exists to
   * prevent, and hearing it would teach the reader nothing about the voice.
   *
   * Written under the library root so the player can fetch it over the same
   * loopback server as the book audio — the webview cannot play a file path.
   */
  async previewVoice(params: { locale: ContentLocale }): Promise<string> {
    const settings = await readSettings();
    const voice = settings.voices[params.locale];
    const rel = join('.preview', `${params.locale}.mp3`);
    await speakSample(SAMPLE[params.locale], voice, join(DATA_DIR, rel));
    return rel;
  },

  /** Show the library in Finder. Never opens a file, only reveals the folder. */
  async revealDataDir(): Promise<null> {
    Bun.spawn(['open', DATA_DIR], { stdout: 'ignore', stderr: 'ignore' });
    return null;
  },

  /**
   * Throw away everything derived from the books, keeping the books themselves.
   * Irreversible, and the reader has already confirmed it in the panel.
   */
  /** Which model route is in force, for the settings panel to show. */
  async modelStatus(): Promise<ModelStatus> {
    return modelStatus();
  },

  async setMenuLocale(params: { locale: UiLocale }): Promise<null> {
    installMenu(params.locale);
    return null;
  },

  async clearCache(): Promise<null> {
    await rm(join(DATA_DIR, '.cache'), { recursive: true, force: true });
    await rm(join(DATA_DIR, '.preview'), { recursive: true, force: true });
    return null;
  },
};

/**
 * What language a book's own content is in.
 *
 * Recorded when it was added. Missing on books built before that, which were
 * all Chinese-prompted, so that is what they resolve to.
 */
async function localeOfBook(bookId: string): Promise<ContentLocale> {
  const entry = (await listBooks()).find((b) => b.id === bookId);
  return entry?.language ?? 'zh';
}

/** One sentence per language, each written in that language on purpose. */
const SAMPLE: Readonly<Record<ContentLocale, string>> = {
  en: 'A chapter that cannot make one thing clear is worth nothing.',
  zh: '一章讲不清一件事，就什么都不是。',
};

/** The search tool, with whichever key is in force — the panel's, then the environment's. */
async function tavilySearch(): Promise<ReturnType<typeof tavily>> {
  return tavily(await effectiveTavilyKey());
}

/**
 * Every failure leaves here as an encoded payload, so the player can word it in
 * the reader's own language. See `shared/errors.ts`.
 */
export const handlers = encodingErrors(rawHandlers);

export { listBooks };

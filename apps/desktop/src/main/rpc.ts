import { openFileDialog } from 'electrobun/main/utils';
import { ACCEPTED_EXTENSIONS } from '@cairn/core/parse';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import { isBookId, type LibraryEntry } from '@cairn/core/store/library';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { speakSample } from '@cairn/core/runtime';
import { readSettings, readSettingsForRenderer, writeSettings } from './settings';
import { redactSettings } from '../shared/settings';
import type {
  ContentLocale, ModelStatus, ShellSettingsValues, UiLocale,
} from '../shared/settings';
import { installMenu } from './menu';
import { library } from './library';
import { DATA_DIR, loadPath } from './store';
import { markBookFinished } from './reading';
import { loadSession } from './companion/session';
import { compactBookChat, runTurn } from './companion/run';
import type { CompanionEvent } from './companion/events';
import { modelStatus } from './provider';
import type { BookPreview, Progress } from '../shared/types';
import {
  generate, inspect, listBooks, removeBook, resume, schedulerFor,
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

let emitCompanion: (event: CompanionEvent) => void = () => undefined;
export function onCompanionEvent(fn: (event: CompanionEvent) => void): void {
  emitCompanion = fn;
}

let activeChat: { readonly turnId: string; readonly controller: AbortController } | undefined;

/**
 * The last progress of the run in flight.
 *
 * Pushed messages are the fast path, but they are fire-and-forget: a reloaded
 * window, or a dropped message, leaves the modal frozen for the rest of a run
 * that takes minutes. Keeping the value here lets the window ask instead.
 */
let latest: Progress | undefined;

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

  async markBookFinished(params: { bookId: string; nodeId: string }): Promise<boolean> {
    return markBookFinished(params.bookId, params.nodeId);
  },

  async chatHistory(params: { bookId: string }) {
    if (!isBookId(params.bookId)) throw new Error('invalid_book_id');
    const path = await loadPath(params.bookId);
    return loadSession(DATA_DIR, params.bookId, path.generatedAt);
  },

  async chatSend(params: { turnId: string; bookId: string; nodeId?: string; question: string; selection?: string }): Promise<boolean> {
    if (activeChat) return false;
    const controller = new AbortController();
    activeChat = { turnId: params.turnId, controller };
    let terminal = false;
    void runTurn({ ...params, signal: controller.signal }, (event) => {
      if (event.type === 'final' || event.type === 'error') terminal = true;
      emitCompanion(event);
    })
      .catch((cause: unknown) => {
        if (!terminal) emitCompanion({
          type: 'error', turnId: params.turnId, bookId: params.bookId,
          code: 'model_failed', message: cause instanceof Error ? cause.message : String(cause),
        });
        console.error('chatSend failed', cause);
      })
      .finally(() => { if (activeChat?.turnId === params.turnId) activeChat = undefined; });
    return true;
  },

  async chatCancel(params: { turnId: string }): Promise<boolean> {
    if (activeChat?.turnId !== params.turnId) return false;
    activeChat.controller.abort();
    return true;
  },

  async chatCompact(params: { bookId: string }): Promise<boolean> {
    if (activeChat) return false;
    await compactBookChat(params.bookId);
    return true;
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

  /* ---- settings ---- */

  async getSettings(): Promise<ShellSettingsValues> {
    return readSettingsForRenderer();
  },

  async setSettings(patch: Partial<ShellSettingsValues>): Promise<ShellSettingsValues> {
    return redactSettings(await writeSettings(patch));
  },

  /** Where generated books live, as a path a human can read and open. */
  async dataDir(): Promise<string> {
    return DATA_DIR;
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

/** One sentence per language, each written in that language on purpose. */
const SAMPLE: Readonly<Record<ContentLocale, string>> = {
  en: 'A chapter that cannot make one thing clear is worth nothing.',
  zh: '一章讲不清一件事，就什么都不是。',
};

/**
 * Every failure leaves here as an encoded payload, so the player can word it in
 * the reader's own language. See `shared/errors.ts`.
 */
export const handlers = encodingErrors(rawHandlers);

export { listBooks };

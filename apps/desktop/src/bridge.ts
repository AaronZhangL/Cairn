import { CairnError } from '@cairn/core/errors';
import type { Answer } from '@cairn/core/pipeline/ask';
import type { OutsideAnswer } from '@cairn/core/pipeline/ask-outside';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import { LIBRARY_INDEX, type LibraryEntry } from '@cairn/core/store/library';
import { decodeError } from './shared/errors';
import type {
  ContentLocale, ModelStatus, ShellSettingsValues, UiLocale,
} from './shared/settings';
import type { CairnRPC } from './shared/schema';
import type { BookPreview, DeckStatus, Progress } from './shared/types';

/**
 * Renderer side of the bridge.
 *
 * The Electrobun SDK loads lazily and only when the shell is present: importing
 * it at module scope takes the whole page down when it is not, which is exactly
 * what `bun run dev` is.
 */
type RequestOptions = { maxRequestTime: number };

type Rpc = {
  request: {
    libraryBase(): Promise<string>;
    progressNow(p: undefined, o?: RequestOptions): Promise<Progress | null>;
    pickBook(p: undefined, o?: RequestOptions): Promise<BookPreview | null>;
    generateBook(
      p: { filePath: string; budgetId: BudgetId }, o?: RequestOptions,
    ): Promise<LibraryEntry>;
    ask(
      p: { bookId: string; question: string; selection?: string; nodeId: string },
      o?: RequestOptions,
    ): Promise<Answer>;
    askOutside(
      p: { question: string; bookTitle?: string }, o?: RequestOptions,
    ): Promise<OutsideAnswer>;
    focusStation(p: { bookId: string; nodeId: string }, o?: RequestOptions): Promise<null>;
    resumeBook(p: { bookId: string }, o?: RequestOptions): Promise<boolean>;
    deleteBook(p: { bookId: string }, o?: RequestOptions): Promise<boolean>;
    getSettings(p: undefined, o?: RequestOptions): Promise<ShellSettingsValues>;
    setSettings(
      p: Partial<ShellSettingsValues>, o?: RequestOptions,
    ): Promise<ShellSettingsValues>;
    dataDir(p: undefined, o?: RequestOptions): Promise<string>;
    engineStatus(
      p: { recheck?: boolean }, o?: RequestOptions,
    ): Promise<{ found: boolean; path?: string }>;
    previewVoice(p: { locale: ContentLocale }, o?: RequestOptions): Promise<string>;
    revealDataDir(p: undefined, o?: RequestOptions): Promise<null>;
    clearCache(p: undefined, o?: RequestOptions): Promise<null>;
    setMenuLocale(p: { locale: UiLocale }, o?: RequestOptions): Promise<null>;
    modelStatus(p: undefined, o?: RequestOptions): Promise<ModelStatus>;
  };
};

/**
 * The RPC layer times requests out after one second by default, which is shorter
 * than every call here that does real work: parsing a 14 MB EPUB, waiting on a
 * native dialog the reader is still looking at, or a `codex exec` round trip.
 *
 * No bound at all where the wait is the reader's own (the file dialog) or is
 * reported by progress messages anyway (generation). A generous but finite bound
 * on questions, so a wedged model surfaces as an error instead of a spinner.
 */
const NO_LIMIT: RequestOptions = { maxRequestTime: Infinity };
const ANSWER_LIMIT: RequestOptions = { maxRequestTime: 5 * 60_000 };
/** A poll that cannot answer within this is a poll worth dropping. */
const POLL_LIMIT: RequestOptions = { maxRequestTime: 10_000 };

/**
 * The shell injects `__electrobun` (with the underscores) before the page runs.
 * Guessing this name wrong silently disables every shell-only feature, so it is
 * read from the same global the SDK itself uses.
 */
export const inShell =
  typeof window !== 'undefined' && '__electrobun' in (window as unknown as Record<string, unknown>);

const progressListeners = new Set<(p: Progress) => void>();
const deckStatusListeners = new Set<(s: DeckStatus) => void>();

export function onProgress(fn: (p: Progress) => void): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

/** Stations arriving after generation's modal has closed. */
export function onDeckStatus(fn: (s: DeckStatus) => void): () => void {
  deckStatusListeners.add(fn);
  return () => deckStatusListeners.delete(fn);
}

let rpcPromise: Promise<Rpc> | undefined;

function connect(): Promise<Rpc> {
  rpcPromise ??= (async () => {
    const { Electroview } = await import('electrobun/view');
    // Same helper as the bun side, so both derive local/remote from one schema
    const rpc = Electroview.defineRPC<CairnRPC>({
      handlers: {
        requests: {},
        messages: {
          progress: (p: Progress) => {
            for (const fn of progressListeners) fn(p);
          },
          deckStatus: (s: DeckStatus) => {
            for (const fn of deckStatusListeners) fn(s);
          },
        },
      },
    });
    new Electroview({ rpc });
    return rpc as unknown as Rpc;
  })();
  return rpcPromise;
}

/**
 * Asked of a webview with no main process behind it — `bun run dev`.
 * A code rather than a sentence, because the player words it in the reader's
 * own language; see `packages/core/src/errors.ts`.
 */
const offline = (code: 'offline_pick' | 'offline_generate' | 'offline_search' | 'offline_delete'):
  CairnError => new CairnError(code);

/**
 * Re-throw whatever came back over the bridge as the failure it actually was.
 * The bridge only carries `error.message`, so the payload travels inside it.
 */
function rethrow(cause: unknown): never {
  const payload = decodeError(cause instanceof Error ? cause.message : String(cause));
  throw new CairnError(payload.code, payload.params, payload.detail);
}

let basePromise: Promise<string> | undefined;

/**
 * Where book files are read from.
 *
 * In the shell this is the loopback library server, whose port and token are
 * new on every launch, so it is asked for once and reused. Without the shell
 * there is no server and no library — only the sample Vite serves from public/.
 */
export async function libraryBase(): Promise<string> {
  if (!inShell) return '.';
  basePromise ??= connect().then((rpc) => rpc.request.libraryBase());
  return basePromise;
}

/** Reads the index over the same channel as the books themselves. */
export async function listBooks(): Promise<readonly LibraryEntry[]> {
  const res = await fetch(`${await libraryBase()}/${LIBRARY_INDEX}`).catch(() => undefined);
  return res?.ok ? ((await res.json()) as LibraryEntry[]) : [];
}

/**
 * Ask the main process where the current run is.
 *
 * The pushed `progress` message is the fast path; this is the one that cannot be
 * missed, so the modal polls it rather than trusting the stream.
 */
export async function progressNow(): Promise<Progress | undefined> {
  if (!inShell) return undefined;
  const rpc = await connect();
  return (await rpc.request.progressNow(undefined, POLL_LIMIT)) ?? undefined;
}

export async function pickBook(): Promise<BookPreview | null> {
  if (!inShell) throw offline('offline_pick');
  return (await connect()).request.pickBook(undefined, NO_LIMIT).catch(rethrow);
}

export async function generateBook(filePath: string, budgetId: BudgetId): Promise<LibraryEntry> {
  if (!inShell) throw offline('offline_generate');
  return (await connect()).request.generateBook({ filePath, budgetId }, NO_LIMIT).catch(rethrow);
}

export async function ask(params: {
  bookId: string; question: string; selection?: string; nodeId: string;
  sourceChapters: readonly number[];
}): Promise<Answer> {
  if (!inShell) {
    // Not an error: dev mode answers, it just has nothing behind it. The
    // wording belongs to the player, which knows the reader's language.
    return { text: '', grounded: false, sourceChapters: params.sourceChapters };
  }
  const { bookId, question, selection, nodeId } = params;
  return (await connect()).request
    .ask({ bookId, question, selection, nodeId }, ANSWER_LIMIT)
    .catch(rethrow);
}

export async function askOutside(question: string, bookTitle: string): Promise<OutsideAnswer> {
  if (!inShell) throw offline('offline_search');
  return (await connect()).request.askOutside({ question, bookTitle }, ANSWER_LIMIT).catch(rethrow);
}

/* ---- settings the main process owns ---- */

/** Nothing stored is readable without the shell, so dev mode gets the defaults. */
export async function getSettings(): Promise<ShellSettingsValues | undefined> {
  if (!inShell) return undefined;
  return (await connect()).request.getSettings(undefined, POLL_LIMIT).catch(rethrow);
}

export async function setSettings(
  patch: Partial<ShellSettingsValues>,
): Promise<ShellSettingsValues> {
  if (!inShell) throw offline('offline_generate');
  return (await connect()).request.setSettings(patch, POLL_LIMIT).catch(rethrow);
}

export async function dataDir(): Promise<string> {
  if (!inShell) return '';
  return (await connect()).request.dataDir(undefined, POLL_LIMIT).catch(() => '');
}

/** Which model route is in force. Dev mode has no main process to ask. */
export async function modelStatus(): Promise<ModelStatus | undefined> {
  if (!inShell) return undefined;
  return (await connect()).request.modelStatus(undefined, POLL_LIMIT).catch(() => undefined);
}

export async function engineStatus(recheck = false): Promise<{ found: boolean; path?: string }> {
  if (!inShell) return { found: false };
  return (await connect()).request
    .engineStatus({ recheck }, POLL_LIMIT)
    .catch(() => ({ found: false }));
}

/**
 * Synthesise a sample and hand back a URL the player can put in an `<audio>`.
 * Synthesis is a network round trip to Microsoft, so it gets the answer budget
 * rather than the poll one.
 */
export async function previewVoice(locale: ContentLocale): Promise<string> {
  if (!inShell) throw offline('offline_generate');
  const rpc = await connect();
  const rel = await rpc.request.previewVoice({ locale }, ANSWER_LIMIT).catch(rethrow);
  return `${await libraryBase()}/${rel}`;
}

export async function revealDataDir(): Promise<void> {
  if (!inShell) return;
  await (await connect()).request.revealDataDir(undefined, POLL_LIMIT).catch(() => null);
}

export async function clearCache(): Promise<void> {
  if (!inShell) throw offline('offline_delete');
  await (await connect()).request.clearCache(undefined, ANSWER_LIMIT).catch(rethrow);
}

/**
 * Put the native menu in the reader's language.
 *
 * Fire-and-forget, like `focusStation`: a dropped call leaves the menu in the
 * previous language until the next change or launch, which is not worth
 * blocking a language switch on.
 */
export function setMenuLocale(locale: UiLocale): void {
  if (!inShell) return;
  void connect()
    .then((rpc) => rpc.request.setMenuLocale({ locale }, POLL_LIMIT))
    .catch(() => undefined);
}

/**
 * Tell the builder where the reader is.
 *
 * Fire-and-forget: a dropped hint costs a slightly worse build order, never
 * correctness, and blocking navigation on an RPC round trip would be worse than
 * the thing it is optimising.
 */
export function focusStation(bookId: string, nodeId: string): void {
  if (!inShell) return;
  void connect()
    .then((rpc) => rpc.request.focusStation({ bookId, nodeId }, POLL_LIMIT))
    .catch(() => undefined);
}

/** Opening a half-built book asks the main process to pick it back up. */
export async function resumeBook(bookId: string): Promise<void> {
  if (!inShell) return;
  await connect()
    .then((rpc) => rpc.request.resumeBook({ bookId }, POLL_LIMIT))
    .catch(() => undefined);
}

/**
 * Remove a book and everything built from it. Throws if it could not be done,
 * because a delete that silently failed leaves the shelf lying about itself.
 */
export async function deleteBook(bookId: string): Promise<boolean> {
  if (!inShell) throw offline('offline_delete');
  const rpc = await connect();
  // An empty message means the bridge itself failed rather than the handler,
  // which usually means the shell predates this handler — `decodeError` turns
  // that into `main_silent` instead of an empty sentence.
  return rpc.request.deleteBook({ bookId }, ANSWER_LIMIT).catch(rethrow);
}

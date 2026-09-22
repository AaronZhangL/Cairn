import type { Answer } from '@cairn/core/pipeline/ask';
import type { OutsideAnswer } from '@cairn/core/pipeline/ask-outside';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import { LIBRARY_INDEX, type LibraryEntry } from '@cairn/core/store/library';
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

const offline = (what: string): Error =>
  new Error(`开发模式下没有主进程，${what}不可用。用 \`bun run start\` 启动桌面应用。`);

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
  if (!inShell) throw offline('选择文件');
  return (await connect()).request.pickBook(undefined, NO_LIMIT);
}

export async function generateBook(filePath: string, budgetId: BudgetId): Promise<LibraryEntry> {
  if (!inShell) throw offline('生成路径');
  return (await connect()).request.generateBook({ filePath, budgetId }, NO_LIMIT);
}

export async function ask(params: {
  bookId: string; question: string; selection?: string; nodeId: string;
  sourceChapters: readonly number[];
}): Promise<Answer> {
  if (!inShell) {
    return {
      text: '开发模式下没有主进程，模型未接入。用 `bun run start` 启动桌面应用可得到真实回答。',
      grounded: false,
      sourceChapters: params.sourceChapters,
    };
  }
  const { bookId, question, selection, nodeId } = params;
  return (await connect()).request.ask({ bookId, question, selection, nodeId }, ANSWER_LIMIT);
}

export async function askOutside(question: string, bookTitle: string): Promise<OutsideAnswer> {
  if (!inShell) throw offline('联网搜索');
  return (await connect()).request.askOutside({ question, bookTitle }, ANSWER_LIMIT);
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

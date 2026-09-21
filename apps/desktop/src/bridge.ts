import type { Answer } from '@vibe/core/pipeline/ask';
import type { OutsideAnswer } from '@vibe/core/pipeline/ask-outside';
import type { BudgetId } from '@vibe/core/pipeline/budget';
import { LIBRARY_INDEX, type LibraryEntry } from '@vibe/core/store/library';
import type { VibeRPC } from './shared/schema';
import type { BookPreview, Progress } from './shared/types';

/**
 * Renderer side of the bridge.
 *
 * The Electrobun SDK loads lazily and only when the shell is present: importing
 * it at module scope takes the whole page down when it is not, which is exactly
 * what `bun run dev` is.
 */
type Rpc = {
  request: {
    pickBook(): Promise<BookPreview | null>;
    generateBook(p: { filePath: string; budgetId: BudgetId }): Promise<LibraryEntry>;
    ask(p: { bookId: string; question: string; selection?: string; nodeId: string }): Promise<Answer>;
    askOutside(p: { question: string; bookTitle?: string }): Promise<OutsideAnswer>;
  };
};

/**
 * The shell injects `__electrobun` (with the underscores) before the page runs.
 * Guessing this name wrong silently disables every shell-only feature, so it is
 * read from the same global the SDK itself uses.
 */
export const inShell =
  typeof window !== 'undefined' && '__electrobun' in (window as unknown as Record<string, unknown>);

const progressListeners = new Set<(p: Progress) => void>();

export function onProgress(fn: (p: Progress) => void): () => void {
  progressListeners.add(fn);
  return () => progressListeners.delete(fn);
}

let rpcPromise: Promise<Rpc> | undefined;

function connect(): Promise<Rpc> {
  rpcPromise ??= (async () => {
    const { Electroview } = await import('electrobun/view');
    // Same helper as the bun side, so both derive local/remote from one schema
    const rpc = Electroview.defineRPC<VibeRPC>({
      handlers: {
        requests: {},
        messages: {
          progress: (p: Progress) => {
            for (const fn of progressListeners) fn(p);
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

/** Reads the static index rather than the bridge, so it works without the shell too. */
export async function listBooks(): Promise<readonly LibraryEntry[]> {
  const res = await fetch(`./${LIBRARY_INDEX}`);
  return res.ok ? ((await res.json()) as LibraryEntry[]) : [];
}

export async function pickBook(): Promise<BookPreview | null> {
  if (!inShell) throw offline('选择文件');
  return (await connect()).request.pickBook();
}

export async function generateBook(filePath: string, budgetId: BudgetId): Promise<LibraryEntry> {
  if (!inShell) throw offline('生成路径');
  return (await connect()).request.generateBook({ filePath, budgetId });
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
  return (await connect()).request.ask({ bookId, question, selection, nodeId });
}

export async function askOutside(question: string, bookTitle: string): Promise<OutsideAnswer> {
  if (!inShell) throw offline('联网搜索');
  return (await connect()).request.askOutside({ question, bookTitle });
}

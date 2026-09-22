/**
 * Adding a book, from the main process.
 *
 * Three steps, and the split between them is the point:
 *
 *   inspect   parses locally and cheaply, so the budget choice is informed
 *   generate  map -> classify -> reduce, then the FIRST station, then returns
 *   scheduler keeps building the rest in the order the reader walks them
 *
 * The middle step used to include every station, which meant waiting for close
 * to sixty model calls before seeing anything. The path cannot be split — it
 * comes from the full set of chapter notes, and a path that grows as you read
 * would let arrival time decide the station count instead of the budget — but
 * the decks after it are independent of one another, and that is where the wait
 * actually lives.
 */
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseBook } from '@cairn/core/parse';
import { mapChapters } from '@cairn/core/pipeline/map';
import { classifyBook } from '@cairn/core/pipeline/classify';
import { reduceToPath } from '@cairn/core/pipeline/reduce';
import { buildNode, notesByChapter, realMinutes } from '@cairn/core/pipeline/build';
import { BUDGETS, suggestBudgets, type BudgetId } from '@cairn/core/pipeline/budget';
import {
  type DeckScheduler, startDeckScheduler, type SchedulerProgress,
} from '@cairn/core/pipeline/scheduler';
import type { Narrator } from '@cairn/core/pipeline/tts';
import { fileStore } from '@cairn/core/store/file-store';
import { bookSlug, type LibraryEntry, type PathQuality } from '@cairn/core/store/library';
import { edgeTtsNarrator } from '@cairn/core/runtime';
import type { ChapterNote, NodeDeck, ParsedBook, Path } from '@cairn/core/types';
import type { BookPreview, DeckStatus, Progress } from '../shared/types';
import { DATA_DIR } from './store';
import {
  installDeck, installPath, listBooks, patchEntry, rewritePath, writeDeckIndex,
} from './install';
import { traced } from './provider';

const CACHE_DIR = join(DATA_DIR, '.cache');
const narrator: Narrator = edgeTtsNarrator();

/** Parse only. No model calls, so picking a file stays instant. */
export async function inspect(filePath: string): Promise<BookPreview> {
  const book = await read(filePath);
  const { choices, recommended } = suggestBudgets(book.totalWords);

  return {
    id: idFor(book, filePath),
    filePath,
    title: book.title,
    ...(book.author ? { author: book.author } : {}),
    chapters: book.chapters.length,
    words: book.totalWords,
    budgets: choices.map((c) => ({
      id: c.budget.id,
      label: c.budget.label,
      honest: c.honest,
      ...(c.note ? { note: c.note } : {}),
      recommended: c.budget.id === recommended,
    })),
  };
}

// ---------------------------------------------------------------------------
// Running books
// ---------------------------------------------------------------------------

const running = new Map<string, DeckScheduler>();

let emitStatus: (s: DeckStatus) => void = () => undefined;
export function onDeckStatus(fn: (s: DeckStatus) => void): void {
  emitStatus = fn;
}

export function schedulerFor(bookId: string): DeckScheduler | undefined {
  return running.get(bookId);
}

/**
 * Hold every background build, and return the release.
 *
 * A reader's question and a prefetched station go through the same codex
 * process pool. The question is the foreground; it should not queue behind two
 * stations nobody is looking at yet.
 */
export function pauseBackgroundBuilds(): () => void {
  const releases = [...running.values()].map((s) => s.pause());
  return () => { for (const release of releases) release(); };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generate(
  filePath: string,
  budgetId: BudgetId,
  onProgress: (p: Progress) => void,
): Promise<LibraryEntry> {
  // Before the first model call: synthesis runs last, so a missing binary would
  // otherwise be discovered only after paying for every station's slides.
  await narrator.ensureReady();

  const book = await read(filePath);
  const id = idFor(book, filePath);
  const budget = BUDGETS[budgetId];
  const cache = join(CACHE_DIR, id);
  const provider = traced(id);

  const mapStore = await fileStore<readonly ChapterNote[]>(join(cache, 'map.json'));
  const { notes } = await mapChapters(book.chapters, provider, mapStore, {
    onProgress: (p) => onProgress({ stage: 'map', done: p.done + p.failed, total: p.total }),
  });
  if (notes.length === 0) throw new Error('逐章摘要没有产出任何内容');

  onProgress({ stage: 'classify', done: 0, total: 1 });
  const cls = await classifyBook(book.title, notes, provider);

  onProgress({ stage: 'reduce', done: 0, total: 1, note: cls.type });
  const reduced = await reduceToPath(notes, cls.type, book.totalWords, provider, { budget });

  const path: Path = {
    bookId: id, title: book.title, type: cls.type,
    nodes: reduced.nodes, stages: reduced.stages,
    totalMinutes: reduced.totalMinutes, generatedAt: new Date().toISOString(),
  };

  const quality: PathQuality = {
    dropped: reduced.dropped,
    retries: reduced.retries,
    failed: 0,
    unsourcedQuotes: 0,
    estMinutes: reduced.totalMinutes,
    budgetMaxMinutes: budget.maxMinutes,
  };

  // The book becomes openable here, before a single deck exists
  const entry = await installPath(path, notes, book.chapters, {
    id, title: book.title,
    ...(book.author ? { author: book.author } : {}),
    stations: path.nodes.length,
    minutes: path.totalMinutes,
    budgetId, generatedAt: path.generatedAt,
    complete: path.nodes.length === 0,
    built: 0,
    quality,
  });

  const scheduler = await startBuilding(path, notes, budgetId, quality);

  // Return as soon as one station can be played; the rest arrive behind it
  const first = path.nodes[0];
  if (first) {
    onProgress({ stage: 'decks', done: 0, total: path.nodes.length, note: '第一站' });
    await scheduler.waitFor(first.id);
  }

  onProgress({ stage: 'done', done: 1, total: 1 });
  return entry;
}

/**
 * Pick a half-built book back up.
 *
 * Called when one is opened: closing the app mid-run is ordinary, and a book
 * stuck at nine of eighteen stations forever would make the whole progressive
 * scheme worse than the blocking one it replaced.
 */
export async function resume(bookId: string): Promise<boolean> {
  if (running.has(bookId)) return true;

  const entry = (await listBooks()).find((b) => b.id === bookId);
  if (!entry || entry.complete === true) return false;

  const dir = join(DATA_DIR, 'books', bookId);
  const [path, notes] = await Promise.all([
    readJson<Path>(join(dir, 'path.json')),
    readJson<ChapterNote[]>(join(dir, 'notes.json')),
  ]).catch(() => [undefined, undefined] as const);
  if (!path || !notes) return false;

  await startBuilding(path, notes, entry.budgetId as BudgetId, entry.quality);
  return true;
}

async function startBuilding(
  path: Path,
  notes: readonly ChapterNote[],
  budgetId: BudgetId,
  quality: PathQuality | undefined,
): Promise<DeckScheduler> {
  const existing = running.get(path.bookId);
  if (existing) return existing;

  const cache = join(CACHE_DIR, path.bookId);
  const audioDir = join(cache, 'audio');
  const byChapter = notesByChapter(notes);
  const provider = traced(path.bookId);

  // The same store the CLI writes, so a book half-built by `add-book` resumes here
  const store = await fileStore<NodeDeck>(join(cache, `decks-${budgetId}.json`));

  const ready: string[] = [];
  const failed: string[] = [];
  const decks: NodeDeck[] = [];

  const publish = async (progress: SchedulerProgress): Promise<void> => {
    const complete = progress.ready + progress.failed >= path.nodes.length;
    await writeDeckIndex(path.bookId, {
      total: path.nodes.length, ready: [...ready], failed: [...failed], complete,
    });
    emitStatus({
      bookId: path.bookId,
      total: path.nodes.length,
      ready: progress.ready,
      failed: progress.failed,
      complete,
    });
  };

  const scheduler = startDeckScheduler({
    nodes: path.nodes,
    store,
    build: (node) => buildNode(node, byChapter, audioDir, provider, narrator),
    onReady: async (deck, progress) => {
      decks.push(deck);
      // Deck and audio land together: a station listed as ready must be playable
      await installDeck(path.bookId, deck, audioDir);
      ready.push(deck.nodeId);
      await publish(progress);
    },
    onFailed: (nodeId, _error, progress) => {
      failed.push(nodeId);
      void publish(progress);
    },
  });

  running.set(path.bookId, scheduler);

  void scheduler.done.then(async () => {
    const { ready: built, failed: lost } = scheduler.progress;
    // `done` also resolves on stop(); only a genuinely finished book is settled
    if (built + lost >= path.nodes.length) {
      await finish(path, decks, budgetId, quality, scheduler.progress);
    }
  }).catch(() => {
    // Settling the index is bookkeeping; losing it must not take the app down
  }).finally(() => {
    if (running.get(path.bookId) === scheduler) running.delete(path.bookId);
  });

  return scheduler;
}

/** Swap the model's estimate for the measured length, and record what the run cost. */
async function finish(
  path: Path,
  decks: readonly NodeDeck[],
  budgetId: BudgetId,
  quality: PathQuality | undefined,
  progress: SchedulerProgress,
): Promise<void> {
  const minutes = realMinutes(decks);
  await rewritePath({ ...path, totalMinutes: minutes });

  const unsourced = decks.reduce(
    (sum, d) => sum + d.slides.filter((s) => s.layout === 'quote' && s.source === undefined).length,
    0,
  );

  await patchEntry(path.bookId, {
    complete: true,
    built: progress.ready,
    minutes,
    budgetId,
    ...(quality
      ? { quality: { ...quality, failed: progress.failed, unsourcedQuotes: unsourced } }
      : {}),
  });
}

async function read(filePath: string): Promise<ParsedBook> {
  const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  return parseBook(bytes, basename(filePath));
}

const idFor = (book: ParsedBook, filePath: string): string =>
  bookSlug(book.title, (s) => Bun.hash(s).toString(16), filePath);

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

export { listBooks };

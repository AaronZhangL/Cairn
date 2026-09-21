/**
 * Adding a book, from the main process.
 *
 * Runs in two steps on purpose: `inspect` parses locally and cheaply so the
 * reader can choose a budget knowing how long the book actually is, and only
 * `generate` spends model calls.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { parseBook } from '@vibe/core/parse';
import { mapChapters } from '@vibe/core/pipeline/map';
import { classifyBook } from '@vibe/core/pipeline/classify';
import { reduceToPath } from '@vibe/core/pipeline/reduce';
import { buildDecks, withRealDuration } from '@vibe/core/pipeline/build';
import { BUDGETS, suggestBudgets, type BudgetId } from '@vibe/core/pipeline/budget';
import { fileStore } from '@vibe/core/store/file-store';
import { bookSlug, LIBRARY_INDEX, type LibraryEntry } from '@vibe/core/store/library';
import { codexCliProvider } from '@vibe/core/llm';
import type { ChapterNote, NodeDeck, ParsedBook, Path } from '@vibe/core/types';
import type { BookPreview, Progress } from '../shared/types';
import { DATA_DIR, forget } from './store';

const CACHE_DIR = join(DATA_DIR, '.cache');

/** Parse only. No model calls, so picking a file stays instant. */
export async function inspect(filePath: string): Promise<BookPreview> {
  const book = await read(filePath);
  const { choices, recommended } = suggestBudgets(book.totalWords);

  return {
    id: bookSlug(book.title, (s) => Bun.hash(s).toString(16), filePath),
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

export async function generate(
  filePath: string,
  budgetId: BudgetId,
  onProgress: (p: Progress) => void,
): Promise<LibraryEntry> {
  const book = await read(filePath);
  const id = bookSlug(book.title, (s) => Bun.hash(s).toString(16), filePath);
  const budget = BUDGETS[budgetId];
  const cache = join(CACHE_DIR, id);
  const provider = codexCliProvider();

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

  const audioDir = join(cache, 'audio');
  const deckStore = await fileStore<NodeDeck>(join(cache, `decks-${budgetId}.json`));
  const built = await buildDecks(path, notes, audioDir, provider, deckStore, {
    onProgress: (p) => onProgress({ stage: 'decks', done: p.done + p.failed, total: p.total }),
  });

  const entry = await install(
    withRealDuration(path, built), built.decks, notes, book, audioDir, budgetId,
  );
  onProgress({ stage: 'done', done: 1, total: 1 });
  return entry;
}

async function read(filePath: string): Promise<ParsedBook> {
  const bytes = new Uint8Array(await Bun.file(filePath).arrayBuffer());
  return parseBook(bytes, basename(filePath));
}

async function install(
  path: Path,
  decks: readonly NodeDeck[],
  notes: readonly ChapterNote[],
  book: ParsedBook,
  audioDir: string,
  budgetId: BudgetId,
): Promise<LibraryEntry> {
  const dir = join(DATA_DIR, 'books', path.bookId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'audio'), { recursive: true });

  await writeFile(join(dir, 'path.json'), JSON.stringify(path));
  await writeFile(join(dir, 'decks-ordered.json'), JSON.stringify(decks));
  await writeFile(join(dir, 'notes.json'), JSON.stringify(notes));
  // Anchored questions read the original text; without this that feature is mute
  await writeFile(join(dir, 'chapters.json'), JSON.stringify(book.chapters));

  for (const deck of decks) {
    const name = `${deck.nodeId}.mp3`;
    await Bun.write(join(dir, 'audio', name), Bun.file(join(audioDir, name)));
  }

  const entry: LibraryEntry = {
    id: path.bookId, title: path.title,
    ...(book.author ? { author: book.author } : {}),
    stations: path.nodes.length, minutes: path.totalMinutes,
    budgetId, generatedAt: path.generatedAt,
  };

  const index = await listBooks();
  await writeFile(
    join(DATA_DIR, LIBRARY_INDEX),
    JSON.stringify([entry, ...index.filter((b) => b.id !== entry.id)]),
  );
  forget(path.bookId);
  return entry;
}

export async function listBooks(): Promise<readonly LibraryEntry[]> {
  try {
    return JSON.parse(await readFile(join(DATA_DIR, LIBRARY_INDEX), 'utf8')) as LibraryEntry[];
  } catch {
    return [];
  }
}

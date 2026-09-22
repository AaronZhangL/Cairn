/**
 * Writing a book into the library, in the order the reader can use it.
 *
 * The old shape wrote everything at the end, which had two costs. The reader
 * waited for every station before seeing anything, and a crash mid-run left the
 * previous copy already deleted and the new one absent.
 *
 * Now the path lands first — it costs no model calls beyond reduce — and
 * stations are added one file at a time as they are built. An interrupted run
 * leaves a book that opens, says how far it got, and resumes; that state is
 * representable now, which is the actual fix.
 */
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  audioFile, bookDir, bookFile, type DeckIndex, deckFile, deckIndexFile,
  LIBRARY_INDEX, type LibraryEntry, normalizeEntry,
} from '@cairn/core/store/library';
import type { Chapter, ChapterNote, NodeDeck, Path } from '@cairn/core/types';
import { DATA_DIR, forget } from './store';

const at = (relative: string): string => join(DATA_DIR, relative);

/**
 * Every write to the index goes through one chain.
 * Decks land from several lanes at once, and read-modify-write on a shared file
 * from two of them at the same time loses one of the updates.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export async function listBooks(): Promise<readonly LibraryEntry[]> {
  try {
    const raw = JSON.parse(await readFile(at(LIBRARY_INDEX), 'utf8')) as LibraryEntry[];
    return raw.map(normalizeEntry);
  } catch {
    return [];
  }
}

/**
 * Put the path on disk and make the book openable.
 *
 * Decks and audio are cleared here rather than the whole directory: the node ids
 * of a re-run at another budget need not match, so stale stations would linger.
 */
export async function installPath(
  path: Path,
  notes: readonly ChapterNote[],
  chapters: readonly Chapter[],
  entry: LibraryEntry,
): Promise<LibraryEntry> {
  const dir = at(bookDir(path.bookId));
  await rm(join(dir, 'decks'), { recursive: true, force: true });
  await rm(join(dir, 'audio'), { recursive: true, force: true });
  await mkdir(join(dir, 'decks'), { recursive: true });
  await mkdir(join(dir, 'audio'), { recursive: true });

  await writeFile(join(dir, 'path.json'), JSON.stringify(path));
  await writeFile(join(dir, 'notes.json'), JSON.stringify(notes));
  // Anchored questions read the original text; without this that feature is mute
  await writeFile(join(dir, 'chapters.json'), JSON.stringify(chapters));

  await writeDeckIndex(path.bookId, {
    total: path.nodes.length, ready: [], failed: [], complete: path.nodes.length === 0,
  });

  forget(path.bookId);
  return upsertEntry(entry);
}

/** One station becomes playable: its deck and its audio, together. */
export async function installDeck(
  bookId: string,
  deck: NodeDeck,
  audioDir: string,
): Promise<void> {
  const target = at(audioFile(bookId, deck.nodeId));
  await mkdir(join(at(bookDir(bookId)), 'audio'), { recursive: true });
  await Bun.write(target, Bun.file(join(audioDir, `${deck.nodeId}.mp3`)));

  // The deck points at the copy the player can reach, not the cache it was built in
  await mkdir(join(at(bookDir(bookId)), 'decks'), { recursive: true });
  await writeFile(
    at(deckFile(bookId, deck.nodeId)),
    JSON.stringify({ ...deck, audioPath: target }),
  );
}

export async function writeDeckIndex(bookId: string, index: DeckIndex): Promise<void> {
  await mkdir(join(at(bookDir(bookId)), 'decks'), { recursive: true });
  await writeFile(at(deckIndexFile(bookId)), JSON.stringify(index));
}

export async function readDeckIndex(bookId: string): Promise<DeckIndex | undefined> {
  try {
    return JSON.parse(await readFile(at(deckIndexFile(bookId)), 'utf8')) as DeckIndex;
  } catch {
    return undefined;
  }
}

/** Replace the path once its real audio length is known. */
export async function rewritePath(path: Path): Promise<void> {
  await writeFile(at(bookFile(path.bookId, 'path.json')), JSON.stringify(path));
  forget(path.bookId);
}

export function upsertEntry(entry: LibraryEntry): Promise<LibraryEntry> {
  return serialize(async () => {
    const index = await listBooks();
    await writeFile(
      at(LIBRARY_INDEX),
      JSON.stringify([entry, ...index.filter((b) => b.id !== entry.id)]),
    );
    return entry;
  });
}

export function patchEntry(
  bookId: string,
  patch: Partial<LibraryEntry>,
): Promise<LibraryEntry | undefined> {
  return serialize(async () => {
    const index = await listBooks();
    const current = index.find((b) => b.id === bookId);
    if (!current) return undefined;

    const updated = { ...current, ...patch };
    await writeFile(
      at(LIBRARY_INDEX),
      JSON.stringify(index.map((b) => (b.id === bookId ? updated : b))),
    );
    return updated;
  });
}

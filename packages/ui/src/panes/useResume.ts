import { useCallback, useMemo, useRef, useState } from 'react';
import {
  closeBook, EMPTY_RESUME, forgetBook, openBook, parseStored, placeIn, remember, type Place,
  type ResumeStore, shouldWrite,
} from './resume';

export interface Resume {
  /** The book to reopen, read once at mount so a later write cannot move it. */
  readonly lastBookId: string | undefined;
  /** Where the reader stopped in a book, or nothing. */
  readonly placeFor: (bookId: string) => Place | undefined;
  /** A book was opened: remember which, without touching where. */
  readonly open: (bookId: string) => void;
  /** Called from playback; writes are throttled (see resume.ts). */
  readonly record: (bookId: string, place: Place) => void;
  /** Returning to the shelf: keep the positions, forget which book was open. */
  readonly close: () => void;
  /** A book was deleted: drop its position so a re-add starts from the beginning. */
  readonly forget: (bookId: string) => void;
}

/**
 * Persisted reading position, in the same place the pane widths live.
 *
 * The live store is a ref, not state: every `timeupdate` records a position, and
 * re-rendering the app four times a second to remember a number nothing displays
 * would be absurd. `lastBookId` is the one value read into state, because the
 * first render needs it.
 */
export function useResume(key = 'cairn.resume'): Resume {
  const store = useRef<ResumeStore | null>(null);
  // Read on first use rather than on every render: this touches localStorage.
  const current = useCallback((): ResumeStore => (store.current ??= read(key)), [key]);

  const [lastBookId] = useState(() => current().lastBookId);
  /** What is actually on disk, so the throttle compares against that, not the last tick. */
  const written = useRef<Place | undefined>(undefined);

  const placeFor = useCallback((bookId: string) => placeIn(current(), bookId), [current]);

  const record = useCallback((bookId: string, place: Place) => {
    const next = remember(current(), bookId, place);
    store.current = next;
    if (!shouldWrite(written.current, place)) return;
    written.current = place;
    write(key, next);
  }, [key, current]);

  const open = useCallback((bookId: string) => {
    const next = openBook(current(), bookId);
    store.current = next;
    write(key, next);
  }, [key, current]);

  const close = useCallback(() => {
    const next = closeBook(current());
    store.current = next;
    write(key, next);
  }, [key, current]);

  const forget = useCallback((bookId: string) => {
    const next = forgetBook(current(), bookId);
    store.current = next;
    write(key, next);
  }, [key, current]);

  // A fresh object every render would make every caller's memo and effect deps
  // change on every render, which is exactly what this hook must not cause.
  return useMemo(
    () => ({ lastBookId, placeFor, open, record, close, forget }),
    [lastBookId, placeFor, open, record, close, forget],
  );
}

function read(key: string): ResumeStore {
  try {
    return parseStored(window.localStorage.getItem(key), EMPTY_RESUME);
  } catch {
    return EMPTY_RESUME;
  }
}

function write(key: string, store: ResumeStore): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    // A reader who cannot be put back where they stopped can still walk the path
  }
}

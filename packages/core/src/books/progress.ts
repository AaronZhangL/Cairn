/** What a book build reports. Node-free: the webview renders both. */

/** The run the reader is watching, up to the first playable station. */
export interface Progress {
  readonly stage: 'map' | 'classify' | 'reduce' | 'decks' | 'done';
  readonly done: number;
  readonly total: number;
  readonly note?: string;
}

/**
 * How far a book's decks have got. Keeps arriving after the progress modal has
 * closed, because the reader is already walking the path while the rest builds.
 */
export interface DeckStatus {
  readonly bookId: string;
  readonly total: number;
  readonly ready: number;
  readonly failed: number;
  readonly complete: boolean;
}

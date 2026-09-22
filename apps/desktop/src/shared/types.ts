import type { BudgetId } from '@cairn/core/pipeline/budget';

/** Parse-only summary shown before any model call, so the budget choice is informed. */
export interface BookPreview {
  readonly id: string;
  readonly filePath: string;
  readonly title: string;
  readonly author?: string;
  readonly chapters: number;
  readonly words: number;
  readonly budgets: readonly {
    id: BudgetId; label: string; honest: boolean; note?: string; recommended: boolean;
  }[];
}

export interface Progress {
  readonly stage: 'map' | 'classify' | 'reduce' | 'decks' | 'done';
  readonly done: number;
  readonly total: number;
  readonly note?: string;
}

/**
 * How far a book's decks have got.
 *
 * Separate from `Progress`, which describes the run the reader is watching in a
 * modal. This one keeps arriving after that modal has closed, because the
 * reader is already walking the path while the rest of it is being built.
 */
export interface DeckStatus {
  readonly bookId: string;
  readonly total: number;
  readonly ready: number;
  readonly failed: number;
  readonly complete: boolean;
}

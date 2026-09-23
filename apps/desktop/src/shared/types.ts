import type { BudgetId } from '@cairn/core/pipeline/budget';
import type { ContentLocale } from './settings';

/** Parse-only summary shown before any model call, so the budget choice is informed. */
export interface BookPreview {
  readonly id: string;
  readonly filePath: string;
  readonly title: string;
  readonly author?: string;
  readonly chapters: number;
  readonly words: number;
  /**
   * What this book will be read aloud in, decided before a single model call.
   * Shown at the same point the budget is chosen: a book about to be narrated
   * in the wrong language is worth catching before paying for it, not after.
   */
  readonly narration: { readonly locale: ContentLocale; readonly voice: string };
  /**
   * Numbers, not sentences. `ReadingBudget.label` is composed for the terminal
   * tool and is Chinese either way; the player words these itself.
   */
  readonly budgets: readonly {
    id: BudgetId;
    minutes: number;
    honest: boolean;
    /** Present only when the rung would flatten this book: words per station. */
    wordsPerNode?: number;
    recommended: boolean;
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

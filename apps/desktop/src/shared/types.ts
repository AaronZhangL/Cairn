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

/**
 * Reading budget. Duration is the constraint and station count is the result:
 * a dense book gets fewer, deeper stations, a loose one more, shallower ones.
 *
 * Picking a budget changes the station count and coverage, not the length of a
 * station. A station's job is to make one thing clear, which has a floor — you
 * cannot make it shallower, only drop it.
 */
import type { PathNode } from '../types';

export type BudgetId = 'quick' | 'brief' | 'solid' | 'full';

export interface ReadingBudget {
  readonly id: BudgetId;
  readonly label: string;
  /** Target duration range, in minutes. */
  readonly minMinutes: number;
  readonly maxMinutes: number;
  readonly nodeRange: readonly [number, number];
  readonly minutesPerNode: readonly [number, number];
  /** Goes into the prompt; sets how ruthless the selection should be. */
  readonly coverage: string;
}

export const BUDGETS: Readonly<Record<BudgetId, ReadingBudget>> = {
  quick: {
    id: 'quick', label: '10 分钟 · 知道个大概',
    minMinutes: 8, maxMinutes: 14, nodeRange: [4, 5], minutesPerNode: [2, 3],
    coverage: '只要全书的主干论点。够在饭桌上说清这本书讲了什么就行，细节全部舍弃。',
  },
  brief: {
    id: 'brief', label: '30 分钟 · 抓住要点',
    minMinutes: 25, maxMinutes: 36, nodeRange: [8, 11], minutesPerNode: [2, 4],
    coverage: '主干论点加上支撑它的关键论证。舍弃例子、旁支和操作细节。',
  },
  solid: {
    id: 'solid', label: '1 小时 · 真的读懂',
    minMinutes: 52, maxMinutes: 70, nodeRange: [14, 19], minutesPerNode: [3, 4],
    coverage: '概念、论证和代表性的例子。覆盖大部分核心章节，舍弃附录与边缘话题。',
  },
  full: {
    id: 'full', label: '2 小时 · 完整走一遍',
    minMinutes: 100, maxMinutes: 120, nodeRange: [26, 36], minutesPerNode: [3, 5],
    coverage: '覆盖几乎全部实质内容，允许为重要概念单独设站。仍要舍弃版权页、索引、名单这类非内容章节。',
  },
};

export const DEFAULT_BUDGET_ID: BudgetId = 'full';

/** Overrun past this multiple of the target triggers a tighter retry. Being under a hard cap is not licence to overshoot. */
const OVERRUN_TOLERANCE = 1.15;

export function totalMinutes(nodes: readonly PathNode[]): number {
  return nodes.reduce((sum, n) => sum + n.estMinutes, 0);
}

export function exceedsBudget(nodes: readonly PathNode[], budget: ReadingBudget): boolean {
  return totalMinutes(nodes) > budget.maxMinutes * OVERRUN_TOLERANCE;
}

export function clampNodeMinutes(minutes: number, budget: ReadingBudget): number {
  const [lo, hi] = budget.minutesPerNode;
  if (!Number.isFinite(minutes) || minutes <= 0) return lo;
  return Math.min(hi, Math.max(lo, Math.round(minutes)));
}

/** Pick a point inside the budget's station range based on how long the book is. */
export function suggestNodeCount(totalWords: number, budget: ReadingBudget): number {
  const [lo, hi] = budget.nodeRange;
  // Map 80k-600k words linearly onto the station range, clamped at both ends
  const ratio = Math.min(1, Math.max(0, (totalWords - 80_000) / 520_000));
  return Math.round(lo + (hi - lo) * ratio);
}

export interface BudgetChoice {
  readonly budget: ReadingBudget;
  /** False means still offerable but to be labelled: at this length the budget distorts. */
  readonly honest: boolean;
  readonly note?: string;
}

/**
 * Offer budgets that suit the book's length.
 * Offering "10 minutes" for a 7-million-word serial is a lie: each station would
 * have to stand for 1.5 million words, which can only be filled by inventing.
 */
export function suggestBudgets(totalWords: number): {
  readonly choices: readonly BudgetChoice[];
  readonly recommended: BudgetId;
} {
  const choices = (Object.keys(BUDGETS) as BudgetId[]).map((id) => {
    const budget = BUDGETS[id];
    const wordsPerNode = totalWords / suggestNodeCount(totalWords, budget);
    // Past 120k words behind one station, the summary degrades into platitudes
    const honest = wordsPerNode <= 120_000;
    return honest
      ? { budget, honest }
      : { budget, honest, note: `这本书 ${Math.round(totalWords / 10_000)} 万字，该档位每站要概括约 ${Math.round(wordsPerNode / 10_000)} 万字，会流于空泛` };
  });

  const recommended = totalWords >= 300_000 ? 'full'
    : totalWords >= 120_000 ? 'solid'
    : 'brief';

  return { choices, recommended };
}

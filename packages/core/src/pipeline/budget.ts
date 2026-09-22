/**
 * Reading budget. Duration is the constraint and station count is the result:
 * a dense book gets fewer, deeper stations, a loose one more, shallower ones.
 *
 * The four rungs are fixed in *intent* — skim, gist, read, walk it all — but not
 * in minutes. A 40k-word essay collection and a 900k-word textbook cannot share
 * one ladder: "2 hours" is most of the first book and a tenth of the second, so
 * the same label would mean opposite things. `budgetsFor` scales the rungs to
 * the book's own length and chapter structure instead.
 *
 * Picking a rung changes the station count and coverage, not the length of a
 * station. A station's job is to make one thing clear, which has a floor — you
 * cannot make it shallower, only drop it.
 */
import type { ParsedBook, PathNode } from '../types';

export type BudgetId = 'quick' | 'brief' | 'solid' | 'full';

/** What the pipeline needs to know about a book before any model call. */
export interface BookShape {
  readonly totalWords: number;
  readonly chapterCount: number;
}

export function shapeOf(book: ParsedBook): BookShape {
  return { totalWords: book.totalWords, chapterCount: book.chapters.length };
}

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

interface Rung {
  readonly id: BudgetId;
  readonly name: string;
  /** Share of the full walk this rung targets. */
  readonly share: number;
  readonly minutesPerNode: readonly [number, number];
  readonly coverage: string;
}

const RUNGS: readonly Rung[] = [
  {
    id: 'quick', name: '知道个大概', share: 0.1, minutesPerNode: [2, 3],
    coverage: '只要全书的主干论点。够在饭桌上说清这本书讲了什么就行，细节全部舍弃。',
  },
  {
    id: 'brief', name: '抓住要点', share: 0.28, minutesPerNode: [2, 4],
    coverage: '主干论点加上支撑它的关键论证。舍弃例子、旁支和操作细节。',
  },
  {
    id: 'solid', name: '真的读懂', share: 0.58, minutesPerNode: [3, 4],
    coverage: '概念、论证和代表性的例子。覆盖大部分核心章节，舍弃附录与边缘话题。',
  },
  {
    id: 'full', name: '完整走一遍', share: 1, minutesPerNode: [3, 5],
    coverage: '覆盖几乎全部实质内容，允许为重要概念单独设站。仍要舍弃版权页、索引、名单这类非内容章节。',
  },
];

export const DEFAULT_BUDGET_ID: BudgetId = 'full';

/** The book the rungs were calibrated against: Pro Git zh, walked end to end in two hours. */
const ANCHOR_WORDS = 200_000;
const ANCHOR_MINUTES = 120;

/** Under this a walk is not worth splitting into stages; over it nobody finishes in one sitting. */
const FULL_WALK_BOUNDS: readonly [number, number] = [30, 240];

/** Short of this a walk is one station with a preamble, whatever the book. */
const MIN_TARGET_MINUTES = 8;

/**
 * Each rung must clear the one below by more than the two tolerance bands
 * (0.85 * t2 > 1.15 * t1), or a short book collapses all four into the same
 * few minutes and the choice stops meaning anything.
 */
const RUNG_GAP = 1.45;

/**
 * How long a complete walk of this book should take.
 *
 * Sub-linear on purpose: a book four times as long does not carry four times as
 * many distinct ideas, it carries more support for roughly twice as many. The
 * square root keeps the longest books finishable without starving the short ones.
 */
export function fullWalkMinutes(shape: BookShape): number {
  const [lo, hi] = FULL_WALK_BOUNDS;
  const scaled = ANCHOR_MINUTES * Math.sqrt(Math.max(shape.totalWords, 1) / ANCHOR_WORDS);
  return Math.min(hi, Math.max(lo, Math.round(scaled)));
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
}

/**
 * Station count follows from the target duration, bounded by the book's own
 * structure: past roughly two stations per chapter the extra stations are
 * splitting hairs rather than covering more ground.
 */
function nodeRangeFor(targetMinutes: number, shape: BookShape, perNode: readonly [number, number]): readonly [number, number] {
  const [shortest, longest] = perNode;
  const cap = Math.max(3, shape.chapterCount * 2);
  const hi = Math.min(Math.max(3, Math.floor(targetMinutes / shortest)), cap);
  const lo = Math.min(Math.max(3, Math.ceil(targetMinutes / longest)), hi);
  return [lo, hi];
}

/** The four budgets on offer for one book, cheapest rung first. */
export function budgetsFor(shape: BookShape): Readonly<Record<BudgetId, ReadingBudget>> {
  const full = fullWalkMinutes(shape);
  let previous = 0;
  const entries = RUNGS.map((rung) => {
    const target = Math.max(
      MIN_TARGET_MINUTES,
      Math.round(full * rung.share),
      Math.ceil(previous * RUNG_GAP),
    );
    previous = target;
    const budget: ReadingBudget = {
      id: rung.id,
      label: `${formatMinutes(target)} · ${rung.name}`,
      minMinutes: Math.max(5, Math.round(target * 0.85)),
      maxMinutes: Math.round(target * 1.15),
      nodeRange: nodeRangeFor(target, shape, rung.minutesPerNode),
      minutesPerNode: rung.minutesPerNode,
      coverage: rung.coverage,
    };
    return [rung.id, budget] as const;
  });
  return Object.fromEntries(entries) as Record<BudgetId, ReadingBudget>;
}

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

/** Past this much book behind one station, the summary degrades into platitudes. */
const WORDS_PER_NODE_CEILING = 120_000;

/**
 * Offer the four budgets for this book, flagging any rung whose arithmetic does
 * not work out. Scaling the rungs removes most of the mismatch, but a 7-million
 * word serial still cannot be honestly skimmed in a tenth of its full walk.
 */
export function suggestBudgets(shape: BookShape): {
  readonly choices: readonly BudgetChoice[];
  readonly recommended: BudgetId;
} {
  const budgets = budgetsFor(shape);
  const choices = RUNGS.map(({ id }) => {
    const budget = budgets[id];
    const wordsPerNode = shape.totalWords / suggestNodeCount(shape.totalWords, budget);
    const honest = wordsPerNode <= WORDS_PER_NODE_CEILING;
    return honest
      ? { budget, honest }
      : { budget, honest, note: `这本书 ${Math.round(shape.totalWords / 10_000)} 万字，该档位每站要概括约 ${Math.round(wordsPerNode / 10_000)} 万字，会流于空泛` };
  });

  const recommended: BudgetId = shape.totalWords >= 300_000 ? 'full'
    : shape.totalWords >= 120_000 ? 'solid'
    : 'brief';

  return { choices, recommended };
}

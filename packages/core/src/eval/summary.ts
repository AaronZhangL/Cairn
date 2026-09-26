/** Many books' results folded into one verdict on the change. */
import { COHERENCE_MODES, type CoherenceMode } from './judge';
import { type BookEval, isFailed, type Scored } from './run';

export interface SideSummary {
  readonly paths: number;
  readonly coverage: number;
  readonly faithfulness: number;
  readonly unsupportedClaims: number;
  readonly withinBudget: number;
  readonly positionSkew: number;
  readonly orderInversions: number;
  readonly duplicateSources: number;
  readonly textLength: number;
  /** Share of paths passing each mode. */
  readonly coherence: Readonly<Record<CoherenceMode, number>>;
}

export interface Summary {
  readonly baseline: SideSummary;
  readonly candidate: SideSummary;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly failedRuns: number;
  /** Two-sided sign test over the decisive comparisons: how likely a record this lopsided is by chance. */
  readonly pValue: number;
  readonly verdict: 'better' | 'worse' | 'unclear';
  /** Guard metrics that dropped past the noise band, by name. */
  readonly regressions: readonly string[];
}

/** Measured: the unchanged pipeline, judged twice by deepseek-v4-pro, moved faithfulness by 0.08. */
export const NOISE_BAND = 0.1;

/** The same unchanged pipeline lost 5 of 7 decisive comparisons (p 0.45); a record needs to beat this. */
export const ALPHA = 0.1;

/** One missed idea is 1/12 of coverage, so a single path cannot tell a regression from a bad draw. */
export const MIN_PATHS = 3;

export function summarize(books: readonly BookEval[]): Summary {
  const baseline = side(books.flatMap((b) => b.baselines));
  const candidate = side(books.flatMap((b) => b.candidates.filter((c): c is Scored => !isFailed(c))));
  const outcomes = books.flatMap((b) => b.comparisons.map((c) => c.outcome));
  const wins = outcomes.filter((o) => o === 'candidate').length;
  const losses = outcomes.filter((o) => o === 'baseline').length;
  const regressions = regressionsOf(baseline, candidate);
  const pValue = signTest(wins, losses);

  return {
    baseline,
    candidate,
    wins,
    losses,
    ties: outcomes.length - wins - losses,
    failedRuns: books.reduce((sum, b) => sum + b.candidates.filter(isFailed).length, 0),
    pValue,
    verdict: candidate.paths < MIN_PATHS ? 'unclear'
      : regressions.length > 0 ? 'worse'
      : pValue >= ALPHA ? 'unclear'
      : wins > losses ? 'better' : 'worse',
    regressions,
  };
}

function side(paths: readonly Scored[]): SideSummary {
  const mean = (pick: (p: Scored) => number): number =>
    paths.length === 0 ? 0 : paths.reduce((sum, p) => sum + pick(p), 0) / paths.length;
  const coherence = Object.fromEntries(
    COHERENCE_MODES.map((mode) => [mode, mean((p) => (p.coherence[mode].pass ? 1 : 0))]),
  ) as Record<CoherenceMode, number>;

  return {
    paths: paths.length,
    coverage: mean((p) => p.coverage.share),
    faithfulness: mean((p) => p.faithfulness.share),
    unsupportedClaims: mean((p) => p.faithfulness.unsupported.length),
    withinBudget: mean((p) => (p.structural.withinBudget ? 1 : 0)),
    positionSkew: mean((p) => p.structural.positionSkew),
    orderInversions: mean((p) => p.structural.orderInversions),
    duplicateSources: mean((p) => p.structural.duplicateSources),
    // From the nodes, not the stored metric: reports written before it existed still count
    textLength: mean((p) => p.nodes.reduce((sum, n) => sum + n.title.length + n.brief.length + n.keyPoints.join('').length, 0)),
    coherence,
  };
}

function regressionsOf(before: SideSummary, after: SideSummary): readonly string[] {
  if (before.paths === 0 || after.paths === 0) return [];
  const guards: readonly [string, number, number][] = [
    ['faithfulness', before.faithfulness, after.faithfulness],
    ['coverage', before.coverage, after.coverage],
    ['withinBudget', before.withinBudget, after.withinBudget],
  ];
  return guards.filter(([, b, a]) => b - a > NOISE_BAND).map(([name]) => name);
}

export function signTest(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.max(wins, losses);
  let tail = 0;
  for (let i = k; i <= n; i += 1) tail += choose(n, i);
  return Math.min(1, (2 * tail) / 2 ** n);
}

function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i += 1) result = (result * (n - k + i)) / i;
  return result;
}

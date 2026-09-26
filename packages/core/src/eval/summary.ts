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
  readonly verdict: 'better' | 'worse' | 'unclear';
  /** Guard metrics that dropped past the noise band, by name. */
  readonly regressions: readonly string[];
}

/** Judge scores move this much between identical runs; a smaller drop is not a regression. */
export const NOISE_BAND = 0.05;

/** One missed idea is 1/12 of coverage, so a single path cannot tell a regression from a bad draw. */
export const MIN_PATHS = 3;

export function summarize(books: readonly BookEval[]): Summary {
  const baseline = side(books.flatMap((b) => b.baselines));
  const candidate = side(books.flatMap((b) => b.candidates.filter((c): c is Scored => !isFailed(c))));
  const outcomes = books.flatMap((b) => b.comparisons.map((c) => c.outcome));
  const wins = outcomes.filter((o) => o === 'candidate').length;
  const losses = outcomes.filter((o) => o === 'baseline').length;
  const regressions = regressionsOf(baseline, candidate);

  return {
    baseline,
    candidate,
    wins,
    losses,
    ties: outcomes.length - wins - losses,
    failedRuns: books.reduce((sum, b) => sum + b.candidates.filter(isFailed).length, 0),
    verdict: candidate.paths < MIN_PATHS ? 'unclear'
      : regressions.length > 0 || losses > wins ? 'worse' : wins > losses ? 'better' : 'unclear',
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

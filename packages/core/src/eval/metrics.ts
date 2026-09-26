/** Numbers a path yields without a model call. Cheap, deterministic, and the first thing to regress. */
import type { ReadingBudget } from '../pipeline/budget';
import { exceedsBudget, totalMinutes } from '../pipeline/budget';
import type { ChapterNote, PathNode } from '../types';

export interface StructuralMetrics {
  readonly stations: number;
  readonly minutes: number;
  /** By the pipeline's own rule, tolerance included, so the eval cannot fail a path reduce accepted. */
  readonly withinBudget: boolean;
  /** Share of chapters cited by at least one station. */
  readonly chapterCoverage: number;
  /** Mean position of cited chapters in the book, 0 = start, 1 = end, minus 0.5. Positive leans late. */
  readonly positionSkew: number;
  /** Adjacent stations whose earliest chapter moves backwards. */
  readonly orderInversions: number;
  /** Stations citing exactly the chapters an earlier station cited. */
  readonly duplicateSources: number;
  /** Characters of title, brief and key points: shown because judges favour the longer side. */
  readonly textLength: number;
}

export function structuralMetrics(
  nodes: readonly PathNode[],
  notes: readonly ChapterNote[],
  budget: ReadingBudget,
): StructuralMetrics {
  const rank = new Map(notes.map((n, i) => [n.idx, i]));
  const cited = nodes.flatMap((n) => n.sourceChapters).filter((c) => rank.has(c));
  const minutes = totalMinutes(nodes);

  return {
    stations: nodes.length,
    minutes,
    withinBudget: !exceedsBudget(nodes, budget),
    chapterCoverage: notes.length === 0 ? 0 : new Set(cited).size / notes.length,
    positionSkew: skewOf(cited.map((c) => rank.get(c) ?? 0), notes.length),
    orderInversions: inversionsOf(nodes),
    duplicateSources: duplicatesOf(nodes),
    textLength: nodes.reduce((sum, n) => sum + n.title.length + n.brief.length + n.keyPoints.join('').length, 0),
  };
}

function skewOf(ranks: readonly number[], count: number): number {
  if (ranks.length === 0 || count < 2) return 0;
  const mean = ranks.reduce((sum, r) => sum + r / (count - 1), 0) / ranks.length;
  return mean - 0.5;
}

function inversionsOf(nodes: readonly PathNode[]): number {
  const firsts = nodes.map((n) => Math.min(...n.sourceChapters));
  return firsts.filter((first, i) => i > 0 && first < (firsts[i - 1] ?? first)).length;
}

function duplicatesOf(nodes: readonly PathNode[]): number {
  const keys = nodes.map((n) => [...n.sourceChapters].sort((a, b) => a - b).join(','));
  return keys.filter((key, i) => keys.indexOf(key) < i).length;
}

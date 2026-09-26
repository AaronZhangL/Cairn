/**
 * One book through the eval: re-run classify + reduce on its frozen chapter
 * notes, score every path, and set each new one against a baseline. Map is not
 * re-run, so a difference in the report comes from the stages after it.
 */
import type { LlmProvider } from '../llm/types';
import type { ContentLocale } from '../parse/language';
import type { ReadingBudget } from '../pipeline/budget';
import { classifyBook } from '../pipeline/classify';
import type { JobStore } from '../pipeline/job';
import { reduceToPath } from '../pipeline/reduce';
import type { BookType, ChapterNote, SourceKind } from '../types';
import {
  checkCoherence, checkCoverage, checkFaithfulness, type Coherence, type Comparison, comparePaths,
  type Coverage, extractIdeas, type Faithfulness,
} from './judge';
import { type StructuralMetrics, structuralMetrics } from './metrics';
import type { Proposal } from './prompts';

/** Enough to tell a coverage share apart from noise, few enough to judge in one call. */
export const IDEA_COUNT = 12;

export interface Typed extends Proposal {
  readonly type: BookType;
}

export interface Scored extends Typed {
  readonly structural: StructuralMetrics;
  readonly coverage: Coverage;
  readonly faithfulness: Faithfulness;
  readonly coherence: Coherence;
  /** Present on a path reduce made in this run. */
  readonly retries?: number;
  readonly dropped?: number;
}

export interface Failed {
  readonly error: string;
}

export interface EvalBook {
  readonly id: string;
  readonly title: string;
  readonly language: ContentLocale;
  readonly kind: SourceKind;
  readonly budget: ReadingBudget;
  readonly totalWords: number;
  readonly notes: readonly ChapterNote[];
  /** Already-scored baselines (from an earlier run) are reused, not judged again. */
  readonly baselines: readonly (Typed | Scored)[];
  /** Paths an earlier run made, judged again instead of generating new ones. */
  readonly given?: readonly Typed[];
}

export interface BookEval {
  readonly bookId: string;
  /** Scores are only comparable under one judge; a baseline judged by another is judged again. */
  readonly judge: string;
  readonly title: string;
  readonly budgetId: string;
  readonly ideas: readonly string[];
  readonly baselines: readonly Scored[];
  readonly candidates: readonly (Scored | Failed)[];
  /** One per successful candidate, against the baseline at the same position (wrapping). */
  readonly comparisons: readonly Comparison[];
}

export interface EvalProviders {
  readonly generate: LlmProvider;
  readonly judge: LlmProvider;
  /** The judge's model, recorded with the scores. */
  readonly judgeName: string;
}

export interface EvalOptions {
  readonly runs: number;
  readonly ideasStore: JobStore<readonly string[]>;
  readonly onStep?: (step: string) => void;
}

export const isScored = (p: Typed | Scored | Failed): p is Scored => 'structural' in p;
export const isFailed = (p: Scored | Failed): p is Failed => 'error' in p;

export async function evaluateBook(book: EvalBook, providers: EvalProviders, options: EvalOptions): Promise<BookEval> {
  const step = options.onStep ?? (() => undefined);
  const { judge } = providers;

  step('ideas');
  const ideas = await ideasFor(book, judge, options.ideasStore);
  const score = (p: Typed, extra: Partial<Scored> = {}): Promise<Scored> => scorePath(book, ideas, p, judge, extra);

  step('baseline');
  const baselines = await Promise.all(book.baselines.map((b) => (isScored(b) ? b : score(b))));

  const candidates: (Scored | Failed)[] = [];
  const comparisons: Comparison[] = [];
  const runs = book.given?.length ?? options.runs;
  for (let run = 0; run < runs; run += 1) {
    step(`run ${run + 1}/${runs}`);
    try {
      const given = book.given?.[run];
      const made = given
        ? { proposal: given, retries: (given as Partial<Scored>).retries ?? 0, dropped: (given as Partial<Scored>).dropped ?? 0 }
        : await generate(book, providers.generate);
      const candidate = await score(made.proposal, { retries: made.retries, dropped: made.dropped });
      candidates.push(candidate);
      const against = baselines[run % Math.max(1, baselines.length)];
      if (against) {
        comparisons.push(await comparePaths(book.notes, budgetLabel(book.budget), candidate, against, judge));
      }
    } catch (error) {
      // One bad run must not throw away the others; the report shows it
      candidates.push({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  return {
    bookId: book.id, judge: providers.judgeName, title: book.title, budgetId: book.budget.id,
    ideas, baselines, candidates, comparisons,
  };
}

async function generate(
  book: EvalBook, provider: LlmProvider,
): Promise<{ proposal: Typed; retries: number; dropped: number }> {
  const cls = await classifyBook(book.title, book.notes, provider, undefined, book.language, book.kind);
  const reduced = await reduceToPath(book.notes, cls.type, book.totalWords, provider, {
    budget: book.budget, locale: book.language, kind: book.kind,
  });
  const proposal: Typed = { type: cls.type, nodes: reduced.nodes, stages: reduced.stages };
  return { proposal, retries: reduced.retries, dropped: reduced.dropped };
}

async function scorePath(
  book: EvalBook, ideas: readonly string[], proposal: Typed, provider: LlmProvider, extra: Partial<Scored>,
): Promise<Scored> {
  const [coverage, faithfulness, coherence] = await Promise.all([
    checkCoverage(ideas, proposal, provider),
    checkFaithfulness(book.notes, proposal, provider),
    checkCoherence(book.notes, proposal, provider),
  ]);
  return {
    ...proposal,
    ...extra,
    structural: structuralMetrics(proposal.nodes, book.notes, book.budget),
    coverage,
    faithfulness,
    coherence,
  };
}

/** Both sides of every comparison must be scored against the same answer key, so it is made once and kept. */
async function ideasFor(
  book: EvalBook, provider: LlmProvider, store: JobStore<readonly string[]>,
): Promise<readonly string[]> {
  const key = `${book.id}:${book.notes.length}`;
  const cached = await store.get(key);
  if (cached && cached.length > 0) return cached;
  const ideas = await extractIdeas(book.notes, IDEA_COUNT, provider);
  await store.put(key, ideas);
  return ideas;
}

const budgetLabel = (budget: ReadingBudget): string =>
  `${budget.minMinutes}-${budget.maxMinutes} minutes (${budget.id})`;

/**
 * Reduce stage: collapse per-chapter notes into one learning path.
 *
 * The job is not "summarize this book" but "choose the stations worth walking
 * and order them". Selection and ordering are the only thing here that is hard;
 * summarizing is not.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ContentLocale } from '../parse/language';
import type { BookType, ChapterNote, NodeKind, PathNode, Stage } from '../types';
import { promptsFor, type Prompts } from './prompts';
import {
  budgetsFor, clampNodeMinutes, DEFAULT_BUDGET_ID, exceedsBudget,
  type ReadingBudget, suggestNodeCount, totalMinutes,
} from './budget';
import { CairnError } from '../errors';

const KINDS: readonly NodeKind[] = ['concept', 'argument', 'event', 'character'];

/**
 * Stations are nested inside stages rather than carrying a stage name each.
 * Nesting makes a non-contiguous stage (A, B, A) unrepresentable; a flat
 * `stage` field would allow it and leave grouping to guess what was meant.
 */
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stages'],
  properties: {
    stages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'nodes'],
        properties: {
          title: { type: 'string' },
          nodes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['title', 'kind', 'brief', 'keyPoints', 'sourceChapters', 'estMinutes'],
              properties: {
                title: { type: 'string' },
                kind: { type: 'string', enum: KINDS as unknown as string[] },
                brief: { type: 'string' },
                keyPoints: { type: 'array', items: { type: 'string' } },
                sourceChapters: { type: 'array', items: { type: 'integer' } },
                estMinutes: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
} as const;

export interface ReduceResult {
  readonly nodes: readonly PathNode[];
  /** Left-pane grouping. Always covers every node, in order. */
  readonly stages: readonly Stage[];
  readonly budget: ReadingBudget;
  readonly totalMinutes: number;
  /** Times the path was regenerated for overrunning the budget. */
  readonly retries: number;
  /** Stations dropped because their chapter references were not real. */
  readonly dropped: number;
}

export interface ReduceOptions {
  readonly budget?: ReadingBudget;
  readonly signal?: AbortSignal;
  /** The book's own language; the path's titles and briefs come back in it. */
  readonly locale?: ContentLocale;
}


export async function reduceToPath(
  notes: readonly ChapterNote[],
  type: BookType,
  totalWords: number,
  provider: LlmProvider,
  options: ReduceOptions = {},
): Promise<ReduceResult> {
  const prompts = promptsFor(options.locale ?? 'zh');
  const budget = options.budget
    ?? budgetsFor({ totalWords, chapterCount: notes.length })[DEFAULT_BUDGET_ID];
  const valid = new Set(notes.map((n) => n.idx));
  let target = suggestNodeCount(totalWords, budget);
  let dropped = 0;

  for (let retry = 0; retry <= 1; retry += 1) {
    const raw = await provider.complete({
      system: prompts.reduce.system(type, prompts.reduce.coverage[budget.id]),
      label: retry === 0 ? 'reduce' : `reduce.retry${retry}`,
      prompt: prompts.reduce.user({
        digest: digestOf(notes),
        chapterCount: notes.length,
        budgetLabel: prompts.reduce.budgetLabel(budget.targetMinutes, budget.id),
        minMinutes: budget.minMinutes,
        maxMinutes: budget.maxMinutes,
        targetNodes: target,
        minutesPerNode: budget.minutesPerNode,
        stageCount: stageCount(target),
        tightening: retry > 0,
      }),
      schema: SCHEMA,
      signal: options.signal,
    });

    const parsed = parseJsonOutput<{ stages?: RawStage[] }>(raw);
    const { nodes, stages, rejected } = normalize(parsed.stages ?? [], valid, budget, prompts);
    dropped += rejected;

    if (nodes.length === 0) continue;
    if (!exceedsBudget(nodes, budget) || retry === 1) {
      return { nodes, stages, budget, totalMinutes: totalMinutes(nodes), retries: retry, dropped };
    }
    // Over budget: tighten the station target proportionally and try once more
    target = Math.max(3, Math.round(target * (budget.maxMinutes / totalMinutes(nodes))));
  }

  throw new CairnError('reduce_empty');
}

interface RawStage {
  title?: unknown;
  nodes?: unknown;
}

interface RawNode {
  title?: unknown;
  kind?: unknown;
  brief?: unknown;
  keyPoints?: unknown;
  sourceChapters?: unknown;
  estMinutes?: unknown;
}

/**
 * The model can cite chapters that do not exist. Such stations must be dropped:
 * a fabricated station looks exactly like a real one, and the reader has not
 * read the book and cannot tell.
 */
function normalize(
  raw: readonly RawStage[],
  validChapters: ReadonlySet<number>,
  budget: ReadingBudget,
  prompts: Prompts,
): { nodes: readonly PathNode[]; stages: readonly Stage[]; rejected: number } {
  const nodes: PathNode[] = [];
  const stages: Stage[] = [];
  let rejected = 0;

  for (const rawStage of raw) {
    const stageTitle = str(rawStage.title);
    const nodeIds: string[] = [];

    for (const item of Array.isArray(rawStage.nodes) ? (rawStage.nodes as RawNode[]) : []) {
      const title = str(item.title);
      const sources = ints(item.sourceChapters).filter((i) => validChapters.has(i));

      if (title.length === 0 || sources.length === 0) {
        rejected += 1;
        continue;
      }

      const id = `n${nodes.length}`;
      nodes.push({
        id,
        idx: nodes.length,
        title,
        kind: KINDS.includes(item.kind as NodeKind) ? (item.kind as NodeKind) : 'concept',
        brief: str(item.brief),
        keyPoints: strs(item.keyPoints),
        sourceChapters: [...new Set(sources)].sort((a, b) => a - b),
        estMinutes: clampNodeMinutes(Number(item.estMinutes), budget),
      });
      nodeIds.push(id);
    }

    // A stage whose stations were all rejected would render as an empty group
    if (nodeIds.length > 0) {
      const fallback = prompts.reduce.fallbackStage(stages.length + 1);
      stages.push({ title: stageTitle.length > 0 ? stageTitle : fallback, nodeIds });
    }
  }

  return { nodes, stages, rejected };
}



/** Stages must group, so keep at least two stations in each; one-per-stage is no grouping. */
function stageCount(nodeCount: number): number {
  return Math.min(5, Math.max(1, Math.round(nodeCount / 4)));
}

/** Chapter summaries as the prompt sees them. Numbers only — no prose to localise. */
function digestOf(notes: readonly ChapterNote[]): string {
  return notes
    .map((n) => {
      const points = n.keyPoints.slice(0, 3).map((k) => `    - ${k}`).join('\n');
      return `[${n.idx}] ${n.title}\n  ${n.gist}${points ? `\n${points}` : ''}`;
    })
    .join('\n\n');
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
const ints = (v: unknown): readonly number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n)) : [];

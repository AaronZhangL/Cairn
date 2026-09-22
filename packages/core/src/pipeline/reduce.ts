/**
 * Reduce stage: collapse per-chapter notes into one learning path.
 *
 * The job is not "summarize this book" but "choose the stations worth walking
 * and order them". Selection and ordering are the only thing here that is hard;
 * summarizing is not.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { BookType, ChapterNote, NodeKind, PathNode, Stage } from '../types';
import {
  BUDGETS, clampNodeMinutes, DEFAULT_BUDGET_ID, exceedsBudget,
  type ReadingBudget, suggestNodeCount, totalMinutes,
} from './budget';

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
}

export async function reduceToPath(
  notes: readonly ChapterNote[],
  type: BookType,
  totalWords: number,
  provider: LlmProvider,
  options: ReduceOptions = {},
): Promise<ReduceResult> {
  const budget = options.budget ?? BUDGETS[DEFAULT_BUDGET_ID];
  const valid = new Set(notes.map((n) => n.idx));
  let target = suggestNodeCount(totalWords, budget);
  let dropped = 0;

  for (let retry = 0; retry <= 1; retry += 1) {
    const raw = await provider.complete({
      system: systemPrompt(type, budget),
      label: retry === 0 ? 'reduce' : `reduce.retry${retry}`,
      prompt: buildPrompt(notes, target, budget, retry > 0),
      schema: SCHEMA,
      signal: options.signal,
    });

    const parsed = parseJsonOutput<{ stages?: RawStage[] }>(raw);
    const { nodes, stages, rejected } = normalize(parsed.stages ?? [], valid, budget);
    dropped += rejected;

    if (nodes.length === 0) continue;
    if (!exceedsBudget(nodes, budget) || retry === 1) {
      return { nodes, stages, budget, totalMinutes: totalMinutes(nodes), retries: retry, dropped };
    }
    // Over budget: tighten the station target proportionally and try once more
    target = Math.max(3, Math.round(target * (budget.maxMinutes / totalMinutes(nodes))));
  }

  throw new Error('reduce 未能产出任何有效节点');
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
      stages.push({ title: stageTitle.length > 0 ? stageTitle : `第 ${stages.length + 1} 阶段`, nodeIds });
    }
  }

  return { nodes, stages, rejected };
}

function systemPrompt(type: BookType, budget: ReadingBudget): string {
  const shape = type === 'narrative'
    ? '这是一本叙事类的书。站点应沿故事推进：关键事件、转折、人物关系的变化。'
    : '这是一本知识类的书。站点应沿理解推进：先建立概念，再展开论证，最后落到应用。';

  return `你在为一本书设计学习路径。

${shape}

取舍尺度：${budget.coverage}

铁律：
1. 只依据我给出的章节摘要。不得使用你对这本书的任何既有印象。
2. sourceChapters 必须来自我给出的章号，不得编造。
3. 站点要有顺序感：后一站建立在前一站之上，不是摘要的平铺。
4. 不是每章一站。该合并的合并，该跳过的跳过。
5. 阶段名描述**读者此刻在做什么**（如「建立模型」「展开论证」「落到实践」），
   不要复述书的目录。路径已经重排过顺序，沿用原书结构会和实际顺序打架。
6. 预算紧时靠**砍站**，不靠把每站讲得更浅——一站讲不明白一件事就没有价值。
7. 只输出 JSON。`;
}

function buildPrompt(
  notes: readonly ChapterNote[],
  target: number,
  budget: ReadingBudget,
  tightening: boolean,
): string {
  const digest = notes
    .map((n) => {
      const points = n.keyPoints.slice(0, 3).map((k) => `    - ${k}`).join('\n');
      return `[${n.idx}] ${n.title}\n  ${n.gist}${points ? `\n${points}` : ''}`;
    })
    .join('\n\n');

  const urgency = tightening
    ? `\n\n上一次产出的路径超出了预算。这次必须更狠地砍站，控制在 ${target} 站左右——记住是砍站，不是把每站讲浅。`
    : '';

  const [lo, hi] = budget.minutesPerNode;
  return `以下是全书 ${notes.length} 章的摘要。请设计一条学习路径。

用户选择的预算：${budget.label}

约束：
- 目标总时长 ${budget.minMinutes}–${budget.maxMinutes} 分钟
- 站数建议 ${target} 左右，但以时长为准，不要为凑数硬拆
- 每站 estMinutes 在 ${lo}–${hi} 分钟之间
- brief 写清这一站要讲明白什么（2-3 句）
- 把站点分进约 ${stageCount(target)} 个阶段，每个阶段给一个描述读者在做什么的名字。
  **每个阶段至少 2 站**——一站一个阶段等于没有分组${urgency}

${digest}`;
}

/** Stages must group, so keep at least two stations in each; one-per-stage is no grouping. */
function stageCount(nodeCount: number): number {
  return Math.min(5, Math.max(1, Math.round(nodeCount / 4)));
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
const ints = (v: unknown): readonly number[] =>
  Array.isArray(v) ? v.map(Number).filter((n) => Number.isInteger(n)) : [];

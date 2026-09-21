/**
 * Map stage: compress chapter by chapter. This is where the book's text is read,
 * exactly once. Every later stage — classify, reduce, slides — reads the
 * ChapterNotes produced here and never the book again.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { Chapter, ChapterNote } from '../types';
import { type JobOptions, type JobStore, runJob, type JobResult } from './job';

/**
 * How many chapters go into one call.
 * The codex CLI carries ~18k tokens of fixed overhead per call, far more than
 * the chapter text, so batching is mandatory. An HTTP provider costs a few
 * hundred tokens instead and can drop this to 1 for cleaner per-chapter work.
 */
export const DEFAULT_BATCH_SIZE = 4;

const SYSTEM = `你在为一本书生成逐章摘要，供后续生成学习路径使用。

铁律：
1. 只依据我给你的正文作答。不得使用你对这本书的任何既有印象。
2. 正文里没有的内容，一个字也不要补。
3. quotes 必须是正文中逐字出现的原句，不得改写。
4. 每章独立作答，不要跨章推断。
5. 只输出 JSON。`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chapters'],
  properties: {
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['idx', 'gist', 'keyPoints', 'quotes'],
        properties: {
          idx: { type: 'integer' },
          gist: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          quotes: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const;

export interface MapOptions extends Omit<JobOptions, 'concurrency'> {
  readonly batchSize?: number;
  readonly concurrency?: number;
}

export interface MapOutcome {
  readonly notes: readonly ChapterNote[];
  readonly job: JobResult<readonly ChapterNote[]>;
}

export async function mapChapters(
  chapters: readonly Chapter[],
  provider: LlmProvider,
  store: JobStore<readonly ChapterNote[]>,
  options: MapOptions = {},
): Promise<MapOutcome> {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const batches = groupIntoBatches(chapters, batchSize);

  const job = await runJob(
    batches,
    async (batch) => summarizeBatch(batch, provider, options.signal),
    store,
    { ...options, concurrency: options.concurrency ?? provider.suggestedConcurrency },
  );

  const notes = [...job.results.values()]
    .flat()
    .sort((a, b) => a.idx - b.idx);

  return { notes, job };
}

/** Batch ids come from the first and last chapter, so a re-run produces the same ids and resume works. */
function groupIntoBatches(
  chapters: readonly Chapter[],
  size: number,
): readonly { id: string; input: readonly Chapter[] }[] {
  const batches: { id: string; input: readonly Chapter[] }[] = [];
  for (let i = 0; i < chapters.length; i += size) {
    const slice = chapters.slice(i, i + size);
    const first = slice[0]!;
    const last = slice[slice.length - 1]!;
    batches.push({ id: `map:${first.idx}-${last.idx}`, input: slice });
  }
  return batches;
}

async function summarizeBatch(
  batch: readonly Chapter[],
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<readonly ChapterNote[]> {
  const raw = await provider.complete({
    system: SYSTEM,
    prompt: buildPrompt(batch),
    schema: SCHEMA,
    signal,
  });

  const parsed = parseJsonOutput<{ chapters?: RawNote[] }>(raw);
  const byIdx = new Map((parsed.chapters ?? []).map((n) => [n.idx, n]));

  // Trust the input chapters, not the model's list: it may drop one or invent an idx
  return batch.map((chapter) => toNote(chapter, byIdx.get(chapter.idx)));
}

interface RawNote {
  idx: number;
  gist?: string;
  keyPoints?: unknown;
  quotes?: unknown;
}

function toNote(chapter: Chapter, raw: RawNote | undefined): ChapterNote {
  return {
    idx: chapter.idx,
    title: chapter.title,
    gist: typeof raw?.gist === 'string' ? raw.gist.trim() : '',
    keyPoints: toStringArray(raw?.keyPoints),
    quotes: toStringArray(raw?.quotes),
  };
}

function toStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function buildPrompt(batch: readonly Chapter[]): string {
  const body = batch
    .map((c) => `<章 idx="${c.idx}" 标题="${c.title}">\n${c.text}\n</章>`)
    .join('\n\n');

  return `以下是 ${batch.length} 章正文。为每一章产出 gist（1-2 句）、keyPoints（2-4 条）、quotes（1-3 句原文摘句）。

idx 必须原样回填，不得改动。

${body}`;
}

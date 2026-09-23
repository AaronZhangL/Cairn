/**
 * Map stage: compress chapter by chapter. This is where the book's text is read,
 * exactly once. Every later stage — classify, reduce, slides — reads the
 * ChapterNotes produced here and never the book again.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ContentLocale } from '../parse/language';
import type {
  Chapter, ChapterContrast, ChapterFigure, ChapterNote, ChapterRelation, ChapterSequence,
} from '../types';
import { type JobOptions, type JobStore, runJob, type JobResult } from './job';
import { promptsFor, type Prompts } from './prompts';

/**
 * How many chapters go into one call.
 * The codex CLI carries ~18k tokens of fixed overhead per call, far more than
 * the chapter text, so batching is mandatory. An HTTP provider costs a few
 * hundred tokens instead and can drop this to 1 for cleaner per-chapter work.
 */
export const DEFAULT_BATCH_SIZE = 4;


const listOf = (keys: readonly string[]): Record<string, unknown> => ({
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: [...keys],
    properties: Object.fromEntries(keys.map((k) => [k, { type: 'string' }])),
  },
});

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
        required: ['idx', 'gist', 'keyPoints', 'quotes', 'figures', 'contrasts', 'sequences', 'relations'],
        properties: {
          idx: { type: 'integer' },
          gist: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          quotes: { type: 'array', items: { type: 'string' } },
          figures: listOf(['value', 'label']),
          contrasts: listOf(['about', 'left', 'right']),
          sequences: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['title', 'steps'],
              properties: { title: { type: 'string' }, steps: listOf(['mark', 'text']) },
            },
          },
          relations: listOf(['from', 'how', 'to']),
        },
      },
    },
  },
} as const;

export interface MapOptions extends Omit<JobOptions, 'concurrency'> {
  readonly batchSize?: number;
  readonly concurrency?: number;
  /** The book's own language, which decides what language the notes come back in. */
  readonly locale?: ContentLocale;
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
  const prompts = promptsFor(options.locale ?? 'zh');
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const batches = groupIntoBatches(chapters, batchSize);

  const job = await runJob(
    batches,
    async (batch) => summarizeBatch(batch, prompts, provider, options.signal),
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
  prompts: Prompts,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<readonly ChapterNote[]> {
  const first = batch[0]!;
  const last = batch[batch.length - 1]!;

  const raw = await provider.complete({
    system: prompts.map.system,
    label: `map:${first.idx}-${last.idx}`,
    prompt: prompts.map.user(batch),
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
  figures?: unknown;
  contrasts?: unknown;
  sequences?: unknown;
  relations?: unknown;
}

function toNote(chapter: Chapter, raw: RawNote | undefined): ChapterNote {
  return {
    idx: chapter.idx,
    title: chapter.title,
    gist: typeof raw?.gist === 'string' ? raw.gist.trim() : '',
    keyPoints: toStringArray(raw?.keyPoints),
    quotes: toStringArray(raw?.quotes),
    figures: records<ChapterFigure>(raw?.figures, ['value', 'label']),
    contrasts: records<ChapterContrast>(raw?.contrasts, ['about', 'left', 'right']),
    sequences: toSequences(raw?.sequences),
    relations: records<ChapterRelation>(raw?.relations, ['from', 'how', 'to']),
  };
}

function toStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Every key must be present and non-empty: a half-filled figure is not a figure. */
function records<T>(value: unknown, keys: readonly string[]): readonly T[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const filled = keys.map((k) => [k, text(row[k])] as const);
    return filled.every(([, v]) => v.length > 0)
      ? [Object.fromEntries(filled) as T]
      : [];
  });
}

/** `mark` alone may be empty: not every sequence in a book is dated. */
function toSequences(value: unknown): readonly ChapterSequence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const row = item as Record<string, unknown>;
    const title = text(row.title);
    const raw = Array.isArray(row.steps) ? row.steps : [];
    const steps = raw.flatMap((step) => {
      if (typeof step !== 'object' || step === null) return [];
      const s = step as Record<string, unknown>;
      const body = text(s.text);
      return body ? [{ mark: text(s.mark), text: body }] : [];
    });
    return title && steps.length > 1 ? [{ title, steps }] : [];
  });
}


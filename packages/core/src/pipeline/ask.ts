/**
 * Question answering over a book the user is walking through.
 *
 * Deliberately built without a vector store. Two cases, two shapes:
 *
 *   Anchored   — the user highlighted a passage. We already know the station and
 *                its sourceChapters, so there is nothing to search for. One call.
 *   Unanchored — "where else does the book discuss X?". The ChapterNote list is
 *                already a whole-book index (~20k tokens for a 200k-word book), so
 *                we hand the model that index, let it name the chapters, then load
 *                them. Two calls, no embeddings.
 *
 * Embeddings only start to earn their place when the index itself no longer fits
 * in context — a 7M-word serial, not an ordinary book. `ChapterLocator` exists so
 * a real retriever can be dropped in without touching callers.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { Chapter, ChapterNote, PathNode } from '../types';

/** How much of the source chapter to include around a highlighted passage. */
const CONTEXT_CHARS = 1200;
/** Chapters the locator may return for an unanchored question. */
const MAX_LOCATED_CHAPTERS = 4;

export interface Answer {
  readonly text: string;
  /** False when the supplied material did not contain the answer. */
  readonly grounded: boolean;
  readonly sourceChapters: readonly number[];
  /** Present when ungrounded: where the user should look instead. */
  readonly suggestion?: string;
}

const ANSWER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  // Every key in properties must appear in required; optionals are nullable instead
  required: ['text', 'grounded', 'suggestion'],
  properties: {
    text: { type: 'string' },
    grounded: { type: 'boolean' },
    suggestion: { type: ['string', 'null'] },
  },
} as const;

const SYSTEM = `你在回答读者对一本书的提问。

铁律：
1. 只依据我给你的材料作答。不得使用你对这本书或这个主题的任何既有知识。
2. 材料里没有答案时，grounded 设为 false，并在 suggestion 里说明该去看哪一部分，不要硬答。
3. 不要复述材料，直接回答问题。
4. 只输出 JSON。`;

export interface AskAnchoredParams {
  readonly question: string;
  /** The passage the reader highlighted. */
  readonly selection?: string;
  readonly node: PathNode;
  /** Source chapters for that node, already loaded. */
  readonly chapters: readonly Chapter[];
  readonly signal?: AbortSignal;
}

/** The reader highlighted something. No search needed — the station points at its sources. */
export async function askAnchored(
  params: AskAnchoredParams,
  provider: LlmProvider,
): Promise<Answer> {
  const { question, selection, node, chapters } = params;

  const material = chapters
    .map((c) => {
      const body = selection ? excerptAround(c.text, selection) : c.text.slice(0, CONTEXT_CHARS * 2);
      return `<章 idx="${c.idx}" 标题="${c.title}">\n${body}\n</章>`;
    })
    .join('\n\n');

  const raw = await provider.complete({
    system: SYSTEM,
    prompt: `读者正走到这一站：
标题：${node.title}
这一站要讲明白：${node.brief}
${selection ? `\n读者划中的原文：\n「${selection}」\n` : ''}
读者的问题：${question}

可用材料：

${material}`,
    schema: ANSWER_SCHEMA,
    signal: params.signal,
  });

  return toAnswer(raw, chapters.map((c) => c.idx));
}

export interface ChapterLocator {
  /** Returns chapter indices relevant to a question. */
  locate(question: string, signal?: AbortSignal): Promise<readonly number[]>;
}

/**
 * Locator that uses the ChapterNote list as the index.
 * No embeddings, no chunking, no vector store — the notes already summarize every
 * chapter, and for an ordinary book the whole index fits in one prompt.
 */
export function noteIndexLocator(
  notes: readonly ChapterNote[],
  provider: LlmProvider,
): ChapterLocator {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['chapters'],
    properties: { chapters: { type: 'array', items: { type: 'integer' } } },
  } as const;

  return {
    async locate(question, signal) {
      const index = notes
        .map((n) => `[${n.idx}] ${n.title}：${n.gist}`)
        .join('\n');

      const raw = await provider.complete({
        system: '你在为一个问题挑出最相关的章节。只输出 JSON，只返回章号。',
        prompt: `问题：${question}

从下面的章节索引中挑出最多 ${MAX_LOCATED_CHAPTERS} 个最相关的章号。宁少勿滥；确实没有相关章节就返回空数组。

${index}`,
        schema,
        signal,
      });

      const parsed = parseJsonOutput<{ chapters?: unknown }>(raw);
      const valid = new Set(notes.map((n) => n.idx));
      return Array.isArray(parsed.chapters)
        ? parsed.chapters
            .map(Number)
            .filter((i) => Number.isInteger(i) && valid.has(i))
            .slice(0, MAX_LOCATED_CHAPTERS)
        : [];
    },
  };
}

export interface AskBookParams {
  readonly question: string;
  readonly locator: ChapterLocator;
  readonly loadChapter: (idx: number) => Promise<Chapter | undefined>;
  readonly signal?: AbortSignal;
}

/** No highlight — find the relevant chapters first, then answer from them. */
export async function askBook(
  params: AskBookParams,
  provider: LlmProvider,
): Promise<Answer> {
  const located = await params.locator.locate(params.question, params.signal);
  if (located.length === 0) {
    return {
      text: '这本书里没有找到相关内容。',
      grounded: false,
      sourceChapters: [],
      suggestion: '换个说法再问，或者这个问题可能超出了这本书的范围。',
    };
  }

  const chapters = (await Promise.all(located.map(params.loadChapter)))
    .filter((c): c is Chapter => c !== undefined);

  if (chapters.length === 0) {
    return { text: '相关章节的原文已不在本地。', grounded: false, sourceChapters: located };
  }

  const material = chapters
    .map((c) => `<章 idx="${c.idx}" 标题="${c.title}">\n${c.text.slice(0, CONTEXT_CHARS * 3)}\n</章>`)
    .join('\n\n');

  const raw = await provider.complete({
    system: SYSTEM,
    prompt: `读者的问题：${params.question}\n\n可用材料：\n\n${material}`,
    schema: ANSWER_SCHEMA,
    signal: params.signal,
  });

  return toAnswer(raw, chapters.map((c) => c.idx));
}

/** Take a window around the highlighted passage so the model sees its surroundings. */
export function excerptAround(text: string, selection: string): string {
  const at = text.indexOf(selection);
  if (at < 0) return text.slice(0, CONTEXT_CHARS * 2);
  const start = Math.max(0, at - CONTEXT_CHARS);
  const end = Math.min(text.length, at + selection.length + CONTEXT_CHARS);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function toAnswer(raw: string, sourceChapters: readonly number[]): Answer {
  const parsed = parseJsonOutput<{ text?: unknown; grounded?: unknown; suggestion?: unknown }>(raw);
  const suggestion = typeof parsed.suggestion === 'string' ? parsed.suggestion.trim() : '';
  return {
    text: typeof parsed.text === 'string' ? parsed.text.trim() : '',
    grounded: parsed.grounded === true,
    sourceChapters,
    ...(suggestion ? { suggestion } : {}),
  };
}

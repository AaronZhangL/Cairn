/**
 * Slides stage: turn one station into a short deck plus a narration script.
 *
 * Reads ChapterNote, never the raw chapter text. The pipeline reads the book
 * exactly once (in map); re-reading source chapters here would be a second full
 * pass over the book for every station. If a layout comes out thin, the fix is
 * to have map extract more (numbers, comparisons), not to read the book again.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ChapterNote, DraftDeck, DraftSlide, PathNode, Slide } from '../types';
import { targetChars } from './tts';

/** A station is 2–6 minutes of narration; more than six slides turns into a flicker. */
const MAX_SLIDES = 6;
const MIN_SLIDES = 3;

/**
 * OpenAI structured output requires `required` to list every key in `properties`,
 * so a single wide object with per-layout optional fields is rejected. Each layout
 * is its own complete variant instead, and genuinely optional fields are declared
 * nullable rather than omitted.
 */
const str = { type: 'string' } as const;
const nullableStr = { type: ['string', 'null'] } as const;
const strList = { type: 'array', items: str } as const;
const pane = {
  type: 'object', additionalProperties: false, required: ['title', 'points'],
  properties: { title: str, points: strList },
} as const;

const variant = (
  layout: string,
  props: Record<string, unknown>,
): Record<string, unknown> => ({
  type: 'object',
  additionalProperties: false,
  required: ['layout', 'atSentence', ...Object.keys(props)],
  properties: {
    layout: { type: 'string', enum: [layout] },
    atSentence: { type: 'integer' },
    ...props,
  },
});

const SLIDE_SCHEMA = {
  anyOf: [
    variant('title', { title: str, kicker: nullableStr, subtitle: nullableStr }),
    variant('points', { heading: str, points: strList }),
    variant('number', {
      items: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['value', 'label'],
          properties: { value: str, label: str },
        },
      },
      heading: nullableStr,
      note: nullableStr,
    }),
    variant('quote', { text: str, cite: nullableStr }),
    variant('compare', { left: pane, right: pane, heading: nullableStr }),
    variant('flow', { steps: strList, heading: nullableStr }),
  ],
} as const;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sentences', 'slides'],
  properties: {
    sentences: strList,
    slides: { type: 'array', items: SLIDE_SCHEMA },
  },
} as const;

const SYSTEM = `你在把一站学习内容做成一组幻灯 + 一段口播。

幻灯版式：
- title   开场，只有标题和一句副标
- points  不超过 3 条核心论断
- number  实验数据或关键比例对比，2-3 组数字
- quote   原文金句
- compare A 与 B 的对照
- flow    推导链或步骤，不超过 5 步

铁律：
1. 只依据我给出的章节摘要。不得使用你对这本书或这个主题的既有知识。
2. quote 的 text 必须原样取自我给出的摘句，一个字都不能改。
3. number 的数字必须来自摘要里真实出现的数据。摘要里没有数字，就不要用这个版式。
4. 幻灯上写要点，不写完整句子。完整的话留给口播。
5. sentences 是口播稿，按句切分，每句以句号结束，口语化，能读出来。
   **总字数必须接近给定目标**——字数决定音频时长，写短了这一站就不到该有的长度。
6. 每张幻灯的 atSentence 指向它该出现时对应的句子下标（从 0 开始）。
7. 只输出 JSON。`;

export async function makeDeck(
  node: PathNode,
  notes: readonly ChapterNote[],
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<DraftDeck> {
  const raw = await provider.complete({
    system: SYSTEM,
    prompt: buildPrompt(node, notes),
    schema: SCHEMA,
    signal,
  });

  const parsed = parseJsonOutput<{ sentences?: unknown; slides?: unknown }>(raw);
  const sentences = strs(parsed.sentences);
  if (sentences.length === 0) {
    throw new Error(`第 ${node.idx + 1} 站没有产出口播稿`);
  }

  return { nodeId: node.id, sentences, slides: normalize(parsed.slides, sentences.length) };
}

function buildPrompt(node: PathNode, notes: readonly ChapterNote[]): string {
  const material = notes
    .map((n) => {
      const points = n.keyPoints.map((k) => `  - ${k}`).join('\n');
      const quotes = n.quotes.map((q) => `  「${q}」`).join('\n');
      return `[${n.idx}] ${n.title}\n  ${n.gist}\n${points}${quotes ? `\n${quotes}` : ''}`;
    })
    .join('\n\n');

  return `这一站：${node.title}
要讲明白：${node.brief}
${node.keyPoints.length > 0 ? `要点：\n${node.keyPoints.map((k) => `- ${k}`).join('\n')}\n` : ''}
时长约 ${node.estMinutes} 分钟，做 ${MIN_SLIDES}-${MAX_SLIDES} 张幻灯。
口播稿总字数目标 ${targetChars(node.estMinutes)} 字（允许 ±15%），这决定音频时长，请认真控制。

可用材料（来自这一站溯源的章节）：

${material}`;
}

function normalize(raw: unknown, sentenceCount: number): readonly DraftSlide[] {
  if (!Array.isArray(raw)) return [];

  const slides = raw
    .map((item) => toDraftSlide(item as Record<string, unknown>, sentenceCount))
    .filter((s): s is DraftSlide => s !== undefined)
    .slice(0, MAX_SLIDES);

  // A deck whose slides all sit on sentence 0 would show one slide for the whole station
  return [...slides].sort((a, b) => a.atSentence - b.atSentence);
}

function toDraftSlide(item: Record<string, unknown>, sentenceCount: number): DraftSlide | undefined {
  const at = Number(item.atSentence);
  const atSentence = Number.isInteger(at) ? Math.min(Math.max(0, at), sentenceCount - 1) : 0;
  const slide = toSlide(item);
  return slide ? { slide, atSentence } : undefined;
}

/** Drops any slide whose required fields for its layout are missing. */
function toSlide(item: Record<string, unknown>): Slide | undefined {
  switch (item.layout) {
    case 'title': {
      const title = asText(item.title);
      return title ? { layout: 'title', title, ...opt('kicker', item), ...opt('subtitle', item) } : undefined;
    }
    case 'points': {
      const points = strs(item.points).slice(0, 3);
      const heading = asText(item.heading);
      return heading && points.length > 0 ? { layout: 'points', heading, points } : undefined;
    }
    case 'number': {
      const items = Array.isArray(item.items)
        ? item.items
            .map((i) => i as Record<string, unknown>)
            .filter((i) => asText(i.value) && asText(i.label))
            .map((i) => ({ value: asText(i.value), label: asText(i.label) }))
            .slice(0, 3)
        : [];
      return items.length > 0
        ? { layout: 'number', items, ...opt('heading', item), ...opt('note', item) }
        : undefined;
    }
    case 'quote': {
      const quoteText = asText(item.text);
      return quoteText ? { layout: 'quote', text: quoteText, ...opt('cite', item) } : undefined;
    }
    case 'compare': {
      const left = toPane(item.left);
      const right = toPane(item.right);
      return left && right ? { layout: 'compare', left, right, ...opt('heading', item) } : undefined;
    }
    case 'flow': {
      const steps = strs(item.steps).slice(0, 5);
      return steps.length > 1 ? { layout: 'flow', steps, ...opt('heading', item) } : undefined;
    }
    default:
      return undefined;
  }
}

function toPane(value: unknown): { title: string; points: readonly string[] } | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const p = value as Record<string, unknown>;
  const title = asText(p.title);
  const points = strs(p.points).slice(0, 3);
  return title && points.length > 0 ? { title, points } : undefined;
}

const asText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
const opt = (key: string, item: Record<string, unknown>): Record<string, string> => {
  const value = asText(item[key]);
  return value ? { [key]: value } : {};
};

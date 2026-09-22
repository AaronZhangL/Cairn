/**
 * Slides stage: turn one station into a short deck plus a narration script.
 *
 * Reads ChapterNote, never the raw chapter text. The pipeline reads the book
 * exactly once (in map); re-reading source chapters here would be a second full
 * pass over the book for every station. If a layout comes out thin, the fix is
 * to have map extract more (numbers, comparisons), not to read the book again.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import { type FitField, overBudget } from '../fit';
import { ICON_NAMES, toIconName } from '../icons';
import type {
  ChapterNote, ComparePane, DraftDeck, DraftSlide, PathNode, QuoteSource, Slide,
} from '../types';
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
/** Nullable rather than omitted: structured output requires every key in `required`. */
const nullableIcon = { type: ['string', 'null'], enum: [...ICON_NAMES, null] } as const;
const pane = {
  type: 'object', additionalProperties: false, required: ['title', 'points', 'icon'],
  properties: { title: str, points: strList, icon: nullableIcon },
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
    variant('title', { title: str, kicker: nullableStr, subtitle: nullableStr, icon: nullableIcon }),
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
   每个字段的字数上限（中文按字算，英文按词长的一半算）：
   标题 20，副标 30，小标题 24，points 每条 28，
   number 的数值 6、标签 14，flow 每步 16，compare 每栏标题 10、每条 20，
   引文 100。**超出的幻灯会被整张丢弃**，写不下就换个说法，不要硬塞。
5. sentences 是口播稿，按句切分，每句以句号结束，口语化，能读出来。
   **总字数必须接近给定目标**——字数决定音频时长，写短了这一站就不到该有的长度。
6. 每张幻灯的 atSentence 指向它该出现时对应的句子下标（从 0 开始）。
7. icon 只出现在 title 和 compare 的两栏上，用来给这一站一个能认出来的标记。
   只能从给定的名字里挑，挑不到贴切的就填 null。
   **宁可不给也不要硬给**：抽象概念（复利、身份认同、锚定）没有对应的图形，
   硬套一个只会变成毫无意义的装饰。挑的是内容里真实出现的具体事物。
8. 只输出 JSON。`;

export async function makeDeck(
  node: PathNode,
  notes: readonly ChapterNote[],
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<DraftDeck> {
  return composeDeck(
    {
      nodeId: node.id,
      label: `第 ${node.idx + 1} 站`,
      traceLabel: `slides:${node.id}`,
      system: SYSTEM,
      prompt: buildPrompt(node, notes),
      notes,
    },
    provider,
    signal,
  );
}

export interface DeckRequest {
  readonly nodeId: string;
  /** Names the station in an error message, since the reader sees the number, not the id. */
  readonly label: string;
  /** Names the call in a trace. */
  readonly traceLabel: string;
  readonly system: string;
  readonly prompt: string;
  /** Excerpts a quote slide may be traced back to. The recap station has none. */
  readonly notes?: readonly ChapterNote[];
}

/**
 * The half of the slides stage that is not about chapter notes: schema, parsing
 * and slide normalization. Shared with the recap station, which is built from
 * the path rather than from the book (see ./recap.ts) but must produce exactly
 * the same kind of deck.
 */
export async function composeDeck(
  request: DeckRequest,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<DraftDeck> {
  const raw = await provider.complete({
    system: request.system,
    label: request.traceLabel,
    prompt: request.prompt,
    schema: SCHEMA,
    signal,
  });

  const parsed = parseJsonOutput<{ sentences?: unknown; slides?: unknown }>(raw);
  const sentences = strs(parsed.sentences);
  if (sentences.length === 0) {
    throw new Error(`${request.label}没有产出口播稿`);
  }

  const notes = request.notes ?? [];
  const slides = normalize(parsed.slides, sentences.length).map((draft) => attachSource(draft, notes));
  return { nodeId: request.nodeId, sentences, slides };
}

/**
 * Link a quote slide back to the excerpt it came from.
 *
 * The model is told to copy quotes verbatim, and mostly does — but "mostly" is
 * not a property you can render. Resolving the line against the notes turns the
 * instruction into a fact: a slide either carries a source or visibly does not.
 */
function attachSource(draft: DraftSlide, notes: readonly ChapterNote[]): DraftSlide {
  if (draft.slide.layout !== 'quote') return draft;
  const source = locateQuote(draft.slide.text, notes);
  return source ? { ...draft, slide: { ...draft.slide, source } } : draft;
}

/**
 * Shorter than this, a containment match is a coincidence rather than a
 * citation — two Chinese clauses share four characters all the time.
 */
const MIN_MATCH_CHARS = 8;

/** Punctuation and spacing vary between the note and the slide; the words do not. */
function normalizeQuote(text: string): string {
  return text.replace(/[\s\u3000-\u303F\uFF01-\uFF65!-/:-@\[-`{-~]+/gu, '');
}

/**
 * Find the note excerpt a quoted line came from. Exact match first, then
 * containment either way — the model sometimes trims a clause off an excerpt,
 * and sometimes joins two of them.
 */
export function locateQuote(
  text: string,
  notes: readonly ChapterNote[],
): QuoteSource | undefined {
  const target = normalizeQuote(text);
  if (target.length === 0) return undefined;

  let best: { source: QuoteSource; overlap: number } | undefined;

  for (const note of notes) {
    for (const [index, quote] of note.quotes.entries()) {
      const candidate = normalizeQuote(quote);
      if (candidate.length === 0) continue;
      if (candidate === target) return { chapter: note.idx, index };

      const contained = candidate.includes(target) || target.includes(candidate);
      const overlap = Math.min(candidate.length, target.length);
      if (!contained || overlap < MIN_MATCH_CHARS) continue;
      if (!best || overlap > best.overlap) {
        best = { source: { chapter: note.idx, index }, overlap };
      }
    }
  }

  return best?.source;
}

export { MAX_SLIDES, MIN_SLIDES };

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
可用的 icon 名字（没有贴切的就填 null）：${ICON_NAMES.join(' ')}
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

/**
 * Drops any slide whose required fields for its layout are missing, or whose
 * text is past any size the stage can render it at.
 *
 * Length is checked here as well as in the renderer because the two failures
 * are different. `fit.ts` steps the type down for a string that is merely long,
 * which covers everything a model writes when it overshoots. Past the last rung
 * there is no size left, and a slide rendered anyway would overflow its box —
 * so it is dropped, the same way a slide missing a required field is. Dropping
 * one slide costs a beat of the deck; a broken one costs the station.
 *
 * A required field over budget drops the slide. An optional one is omitted
 * instead: losing a kicker is not worth losing the card it sits on.
 */
function toSlide(item: Record<string, unknown>): Slide | undefined {
  switch (item.layout) {
    case 'title': {
      const title = fitted(item.title, 'title');
      if (!title) return undefined;
      const icon = toIconName(item.icon);
      return {
        layout: 'title', title,
        ...opt('kicker', item, 'kicker'), ...opt('subtitle', item, 'subtitle'),
        ...(icon ? { icon } : {}),
      };
    }
    case 'points': {
      const points = strs(item.points).slice(0, 3);
      const heading = fitted(item.heading, 'heading');
      if (!heading || points.length === 0 || anyOverBudget(points, 'point')) return undefined;
      return { layout: 'points', heading, points };
    }
    case 'number': {
      const items = Array.isArray(item.items)
        ? item.items
            .map((i) => i as Record<string, unknown>)
            .filter((i) => asText(i.value) && asText(i.label))
            .map((i) => ({ value: asText(i.value), label: asText(i.label) }))
            .slice(0, 3)
        : [];
      if (items.length === 0) return undefined;
      if (anyOverBudget(items.map((i) => i.value), 'value')) return undefined;
      if (anyOverBudget(items.map((i) => i.label), 'label')) return undefined;
      return {
        layout: 'number', items,
        ...opt('heading', item, 'heading'), ...opt('note', item, 'note'),
      };
    }
    case 'quote': {
      const quoteText = fitted(item.text, 'quote');
      return quoteText
        ? { layout: 'quote', text: quoteText, ...opt('cite', item, 'cite') }
        : undefined;
    }
    case 'compare': {
      const left = toPane(item.left);
      const right = toPane(item.right);
      return left && right
        ? { layout: 'compare', left, right, ...opt('heading', item, 'heading') }
        : undefined;
    }
    case 'flow': {
      const steps = strs(item.steps).slice(0, 5);
      return steps.length > 1 && !anyOverBudget(steps, 'step')
        ? { layout: 'flow', steps, ...opt('heading', item, 'heading') }
        : undefined;
    }
    default:
      return undefined;
  }
}

function toPane(value: unknown): ComparePane | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const p = value as Record<string, unknown>;
  const title = fitted(p.title, 'paneTitle');
  const points = strs(p.points).slice(0, 3);
  if (!title || points.length === 0 || anyOverBudget(points, 'panePoint')) return undefined;
  // An unknown name is dropped rather than repaired: there is no glyph to fall
  // back to, and a wrong pictogram mislabels the pane it sits on.
  const icon = toIconName(p.icon);
  return { title, points, ...(icon ? { icon } : {}) };
}

const asText = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];

/** The text, or '' when no size would fit it — which reads as missing downstream. */
const fitted = (v: unknown, field: FitField): string => {
  const value = asText(v);
  return value && !overBudget(value, field) ? value : '';
};

/** All or nothing: dropping one item of three quietly changes what was claimed. */
const anyOverBudget = (texts: readonly string[], field: FitField): boolean =>
  texts.some((text) => overBudget(text, field));

const opt = (key: string, item: Record<string, unknown>, field: FitField): Record<string, string> => {
  const value = fitted(item[key], field);
  return value ? { [key]: value } : {};
};

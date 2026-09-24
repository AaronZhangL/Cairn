/**
 * Slides stage: turn one station into a short deck plus a narration script.
 *
 * Reads ChapterNote, never the raw chapter text. The pipeline reads the book
 * exactly once (in map); re-reading source chapters here would be a second full
 * pass over the book for every station. If a layout comes out thin, the fix is
 * to have map extract more (numbers, comparisons), not to read the book again.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ContentLocale } from '../parse/language';
import { type NoteMaterial, promptsFor } from './prompts';
import { ICON_NAMES, toIconName } from '../icons';
import { DIAGRAM_VARIANTS, toDiagramSlide } from './diagram-slides';
import {
  anyOverBudget, asText, extras, fitted, focusOf, nullableInt, nullableStr, opt, str, strList,
  strs, variant,
} from './slide-fields';
import type {
  ChapterNote, ComparePane, DraftDeck, DraftSlide, MatrixRow, PathNode, QuoteSource,
  RelationLink, Slide, TimelineItem,
} from '../types';

import { CairnError } from '../errors';

/**
 * One slide per this much narration. A fixed cap of six left a four-minute
 * station showing one card for fifty seconds, which reads as a stall.
 */
const SECONDS_PER_SLIDE = 22;
const FEWEST = 4;
/** Past this the deck flickers, and the model stops distributing atSentence well. */
const MOST = 14;

export interface SlideCount {
  readonly min: number;
  readonly max: number;
}

export function slideCount(estMinutes: number): SlideCount {
  const target = Math.round((Math.max(0, estMinutes) * 60) / SECONDS_PER_SLIDE);
  const max = Math.min(MOST, Math.max(FEWEST + 2, target + 3));
  return { min: Math.min(max - 1, Math.max(FEWEST, target - 2)), max };
}

/** Nullable rather than omitted: structured output requires every key in `required`. */
const nullableIcon = { type: ['string', 'null'], enum: [...ICON_NAMES, null] } as const;
const pane = {
  type: 'object', additionalProperties: false, required: ['title', 'points', 'icon'],
  properties: { title: str, points: strList, icon: nullableIcon },
} as const;

const rowsOf = (keys: readonly string[]): Record<string, unknown> => ({
  type: 'array',
  items: {
    type: 'object', additionalProperties: false, required: [...keys],
    properties: Object.fromEntries(keys.map((k) => [k, str])),
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
      focus: nullableInt,
    }),
    variant('quote', { text: str, cite: nullableStr }),
    variant('compare', { left: pane, right: pane, heading: nullableStr }),
    variant('flow', { steps: strList, heading: nullableStr, aside: nullableStr }),
    variant('timeline', { items: rowsOf(['mark', 'text']), heading: nullableStr }),
    variant('matrix', {
      left: str, right: str, rows: rowsOf(['aspect', 'left', 'right']), heading: nullableStr,
      aside: nullableStr,
    }),
    variant('relation', {
      links: rowsOf(['from', 'how', 'to']), heading: nullableStr, focus: nullableInt, aside: nullableStr,
    }),
    ...DIAGRAM_VARIANTS,
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


export async function makeDeck(
  node: PathNode,
  notes: readonly ChapterNote[],
  provider: LlmProvider,
  signal?: AbortSignal,
  locale: ContentLocale = 'zh',
): Promise<DraftDeck> {
  const prompts = promptsFor(locale);
  const count = slideCount(node.estMinutes);

  return composeDeck(
    {
      nodeId: node.id,
      label: `${node.idx + 1}`,
      traceLabel: `slides:${node.id}`,
      system: prompts.slides.system,
      prompt: prompts.slides.user({
        title: node.title,
        brief: node.brief,
        keyPoints: node.keyPoints,
        minutes: node.estMinutes,
        slides: count,
        secondsPerSlide: SECONDS_PER_SLIDE,
        iconNames: ICON_NAMES,
        material: notes.map((n) => prompts.slides.noteBlock(materialOf(n))).join('\n\n'),
      }),
      maxSlides: slideCount(node.estMinutes).max,
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
  /** Derived from the station's length by `slideCount`; the prompt states it too. */
  readonly maxSlides: number;
  /** Excerpts a quote slide may be traced back to. The recap station has none. */
  readonly notes?: readonly ChapterNote[];
}

/**
 * The half of the slides stage that is not about chapter notes: schema, parsing
 * and slide normalization. Shared with the recap station, which is built from
 * the path rather than from the book (see ./recap.ts) but must produce exactly
 * the same kind of deck.
 */
/** A note's material as data, so each locale renders its own section headings. */
function materialOf(n: ChapterNote): NoteMaterial {
  return {
    idx: n.idx,
    title: n.title,
    gist: n.gist,
    keyPoints: n.keyPoints,
    quotes: n.quotes,
    figures: (n.figures ?? []).map((f) => `${f.value} — ${f.label}`),
    contrasts: (n.contrasts ?? []).map((c) => `${c.about}: ${c.left} / ${c.right}`),
    sequences: (n.sequences ?? []).map(
      (q) => `${q.title}: ${q.steps.map((t) => `${t.mark ? `${t.mark} ` : ''}${t.text}`).join(' → ')}`,
    ),
    relations: (n.relations ?? []).map((r) => `${r.from} ${r.how} ${r.to}`),
    cycles: (n.cycles ?? []).map((c) => `${c.title}: ${[...c.steps, c.steps[0]].join(' → ')}`),
    ranks: (n.ranks ?? []).map((r) => `${r.title}: ${r.levels.map((l, i) => `${i + 1}. ${l}`).join(' ')}`),
    quadrants: (n.quadrants ?? []).map((q) => [
      `x: ${q.xLow} → ${q.xHigh}; y: ${q.yLow} → ${q.yHigh}`,
      ...q.cells.map((c) => `(${c.x}, ${c.y}) ${c.name}: ${c.text}`),
    ].join('; ')),
    overlaps: (n.overlaps ?? []).map((o) => `${o.sets.join(' ∩ ')} = ${o.meet}`),
    causes: (n.causes ?? []).map((c) => `${c.effect} ← ${
      c.groups.map((g) => `${g.name}: ${g.causes.join(', ')}`).join('; ')}`),
  };
}

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
    throw new CairnError('no_narration', { label: request.label });
  }

  const notes = request.notes ?? [];
  const slides = normalize(parsed.slides, sentences.length, request.maxSlides)
    .map((draft) => groundAside(attachSource(draft, notes), notes));
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
 * An aside is set in the book's voice, so one that cannot be found in the
 * quotes would be an invented line wearing a citation's typography.
 */
function groundAside(draft: DraftSlide, notes: readonly ChapterNote[]): DraftSlide {
  const { slide } = draft;
  if (!('aside' in slide) || slide.aside === undefined) return draft;
  if (locateQuote(slide.aside, notes)) return draft;
  const { aside: _unsourced, ...rest } = slide;
  return { ...draft, slide: rest as Slide };
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





function normalize(
  raw: unknown,
  sentenceCount: number,
  maxSlides: number,
): readonly DraftSlide[] {
  if (!Array.isArray(raw)) return [];

  const slides = raw
    .map((item) => toDraftSlide(item as Record<string, unknown>, sentenceCount))
    .filter((s): s is DraftSlide => s !== undefined)
    .slice(0, maxSlides);

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
 * Drops a slide whose required fields are missing, or whose text is past the
 * last rung of the fit ladder — no size renders it without overflow. An
 * optional field over budget is omitted instead of costing the whole slide.
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
        ...focusOf(item.focus, items.length),
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
        ? { layout: 'flow', steps, ...extras(item) }
        : undefined;
    }
    case 'timeline': {
      const items = rows<TimelineItem>(item.items, ['mark', 'text'], 6);
      if (items.length < 2) return undefined;
      if (anyOverBudget(items.map((i) => i.mark), 'timelineMark')) return undefined;
      if (anyOverBudget(items.map((i) => i.text), 'timelineText')) return undefined;
      return { layout: 'timeline', items, ...opt('heading', item, 'heading') };
    }
    case 'matrix': {
      const left = fitted(item.left, 'matrixHead');
      const right = fitted(item.right, 'matrixHead');
      const matrixRows = rows<MatrixRow>(item.rows, ['aspect', 'left', 'right'], 4);
      if (!left || !right || matrixRows.length < 2) return undefined;
      if (anyOverBudget(matrixRows.map((r) => r.aspect), 'matrixAspect')) return undefined;
      const cells = matrixRows.flatMap((r) => [r.left, r.right]);
      if (anyOverBudget(cells, 'matrixCell')) return undefined;
      return { layout: 'matrix', left, right, rows: matrixRows, ...extras(item) };
    }
    case 'relation': {
      const links = rows<RelationLink>(item.links, ['from', 'how', 'to'], 4);
      if (links.length < 2) return undefined;
      if (anyOverBudget(links.flatMap((l) => [l.from, l.to]), 'relationNode')) return undefined;
      if (anyOverBudget(links.map((l) => l.how), 'relationHow')) return undefined;
      return { layout: 'relation', links, ...focusOf(item.focus, links.length), ...extras(item) };
    }
    default:
      return toDiagramSlide(item);
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

/** A row is kept only if every one of its cells is filled: a half-row states half a fact. */
function rows<T>(value: unknown, keys: readonly string[], limit: number): readonly T[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const row = entry as Record<string, unknown>;
      const filled = keys.map((k) => [k, asText(row[k])] as const);
      return filled.every(([, v]) => v.length > 0) ? [Object.fromEntries(filled) as T] : [];
    })
    .slice(0, limit);
}

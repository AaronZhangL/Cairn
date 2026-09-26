/**
 * The last station: the walk's own ending.
 *
 * A path that stops after its final chapter station ends mid-stride — the
 * reader has been handed fifteen separate things and nothing that puts them
 * back together. This station does that, and it is also the only place where
 * "you have finished this book" can be said.
 *
 * It is built from the path, not from the book. Every station already carries
 * the brief it was asked to make clear, so recapping needs no second pass over
 * the chapter notes — which keeps invariant 6 (the text is read exactly once)
 * intact. Its `sourceChapters` is the union of the stations it recaps, so the
 * provenance invariant holds here too: it cites nothing the path did not cite.
 */
import type { DraftDeck, PathNode, Stage, SourceKind } from '../types';
import type { LlmProvider } from '../llm/types';
import { clampNodeMinutes, type ReadingBudget, totalMinutes } from './budget';
import type { ReduceResult } from './reduce';
import type { ContentLocale } from '../parse/language';
import { promptsFor } from './prompts';
import { composeDeck, slideCount } from './slides';


export const RECAP_NODE_ID = 'recap';


/** Enough stations to be worth a recap. Below this the reader still has them all in mind. */
const MIN_STATIONS = 3;

/** Roughly one minute of recap per four stations, then clamped to the budget's station length. */
function recapMinutes(stationCount: number, budget: ReadingBudget): number {
  return clampNodeMinutes(Math.round(stationCount / 4) + 1, budget);
}

/**
 * Append the recap station to a reduced path.
 *
 * Deliberately outside `reduceToPath`: reduce chooses stations from the book and
 * is judged against the budget for doing so. The recap is derived from its
 * result, and adding it there would make the budget retry fight its own output.
 * The overrun it causes is one station's worth and is reported honestly in
 * `totalMinutes`.
 */
export function withRecap(
  reduced: ReduceResult, locale: ContentLocale = 'zh', kind: SourceKind = 'book',
): ReduceResult {
  const prompts = promptsFor(locale, kind);
  if (reduced.nodes.length < MIN_STATIONS) return reduced;

  const chapters = [...new Set(reduced.nodes.flatMap((n) => n.sourceChapters))].sort((a, b) => a - b);
  const recap: PathNode = {
    id: RECAP_NODE_ID,
    idx: reduced.nodes.length,
    title: prompts.recap.title,
    kind: 'recap',
    brief: prompts.recap.brief,
    keyPoints: reduced.nodes.map((n) => n.title),
    sourceChapters: chapters,
    estMinutes: recapMinutes(reduced.nodes.length, reduced.budget),
  };

  const nodes = [...reduced.nodes, recap];
  // Its own stage, and the only one-station stage there is: it belongs to no
  // phase of the walk, it is what happens after the walk.
  const stages: readonly Stage[] = [...reduced.stages, { title: prompts.recap.stageTitle, nodeIds: [recap.id] }];

  return { ...reduced, nodes, stages, totalMinutes: totalMinutes(nodes) };
}

export function isRecap(node: PathNode): boolean {
  return node.kind === 'recap';
}


export async function makeRecapDeck(
  node: PathNode,
  stations: readonly PathNode[],
  bookTitle: string,
  provider: LlmProvider,
  signal?: AbortSignal,
  locale: ContentLocale = 'zh',
  kind: SourceKind = 'book',
): Promise<DraftDeck> {
  const prompts = promptsFor(locale, kind);
  const count = slideCount(node.estMinutes);
  const walked = stations
    .map((s, i) => {
      const points = s.keyPoints.slice(0, 3).map((k) => `  - ${k}`).join('\n');
      return `${i + 1}. ${s.title}\n  ${s.brief}${points ? `\n${points}` : ''}`;
    })
    .join('\n\n');

  return dropQuotes(await composeDeck(
    {
      nodeId: node.id,
      label: prompts.recap.title,
      traceLabel: `slides:${node.id}`,
      system: prompts.recap.system,
      prompt: prompts.recap.user({
        bookTitle,
        recapTitle: prompts.recap.title,
        walked,
        stationCount: stations.length,
        minutes: node.estMinutes,
        slides: count,
      }),
      maxSlides: slideCount(node.estMinutes).max,
      // No notes: this station quotes nothing, because it has no excerpts to
      // quote. `dropQuotes` below enforces that rather than trusting the prompt.
    },
    provider,
    signal,
  ));
}

/**
 * Drop quote slides from the recap.
 *
 * This station is built from station briefs, not from chapter excerpts, so any
 * verbatim-looking line it produces cannot be traced to the book — it would
 * render as an unsourced quote, which is the one hallucination this pipeline
 * counts. The prompt says not to; this makes it impossible.
 */
function dropQuotes(deck: DraftDeck): DraftDeck {
  const slides = deck.slides.filter((d) => d.slide.layout !== 'quote');
  return slides.length === deck.slides.length ? deck : { ...deck, slides };
}


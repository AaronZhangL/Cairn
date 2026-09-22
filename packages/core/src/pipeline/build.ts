/**
 * Build stage: turn every station into a playable deck.
 *
 * Runs slides + tts per node through runJob, so a book interrupted halfway
 * resumes instead of re-spending on decks that already exist.
 *
 * Also replaces the path's advertised length with the real one. `estMinutes`
 * is what the model intended; audio duration is what the reader actually gets,
 * and only the latter should be shown.
 *
 * This is the batch entry point, used by the CLI. The app builds the same decks
 * through `scheduler.ts` instead, in the order the reader is walking them —
 * both write the same JobStore, so they are interchangeable and resumable
 * across each other.
 */
import type { LlmProvider } from '../llm/types';
import type { ChapterNote, NodeDeck, Path, PathNode } from '../types';
import { type JobOptions, type JobResult, type JobStore, runJob } from './job';
import { makeDeck } from './slides';
import { deckAudioPath, type Narrator, type TtsOptions } from './tts';

export interface BuildOptions extends JobOptions, TtsOptions {}

export interface BuildResult {
  readonly decks: readonly NodeDeck[];
  readonly totalMinutes: number;
  readonly job: JobResult<NodeDeck>;
  /** Quote slides whose text was not found verbatim in any chapter note. */
  readonly unsourcedQuotes: number;
}

/**
 * Build one station. Shared by the batch runner and the scheduler so the two
 * paths cannot drift in what a deck is.
 */
export async function buildNode(
  node: PathNode,
  byChapter: ReadonlyMap<number, ChapterNote>,
  audioDir: string,
  provider: LlmProvider,
  narrator: Narrator,
  options: TtsOptions = {},
): Promise<NodeDeck> {
  const notes = node.sourceChapters
    .map((idx) => byChapter.get(idx))
    .filter((n): n is ChapterNote => n !== undefined);

  if (notes.length === 0) {
    throw new Error(`第 ${node.idx + 1} 站「${node.title}」的溯源章节不存在`);
  }

  const draft = await makeDeck(node, notes, provider, options.signal);
  return narrator.speak(draft, deckAudioPath(audioDir, node.id), options);
}

export function notesByChapter(
  notes: readonly ChapterNote[],
): ReadonlyMap<number, ChapterNote> {
  return new Map(notes.map((n) => [n.idx, n]));
}

export async function buildDecks(
  path: Path,
  notes: readonly ChapterNote[],
  audioDir: string,
  provider: LlmProvider,
  narrator: Narrator,
  store: JobStore<NodeDeck>,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const byChapter = notesByChapter(notes);

  const job = await runJob(
    path.nodes.map((node) => ({ id: node.id, input: node })),
    async (node) => buildNode(node, byChapter, audioDir, provider, narrator, options),
    store,
    { ...options, concurrency: options.concurrency ?? provider.suggestedConcurrency },
  );

  const order = new Map(path.nodes.map((n, i) => [n.id, i]));
  const decks = [...job.results.values()].sort(
    (a, b) => (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0),
  );

  return {
    decks,
    totalMinutes: realMinutes(decks),
    job,
    unsourcedQuotes: countUnsourcedQuotes(decks),
  };
}

export function realMinutes(decks: readonly NodeDeck[]): number {
  return Math.round(decks.reduce((sum, d) => sum + d.durationMs, 0) / 60_000);
}

/**
 * A quote slide with no `source` means the model's "verbatim" line was not found
 * in any note it was given. That is the one hallucination this pipeline cannot
 * catch structurally, so it is counted rather than hidden.
 */
export function countUnsourcedQuotes(decks: readonly NodeDeck[]): number {
  let count = 0;
  for (const deck of decks) {
    for (const slide of deck.slides) {
      if (slide.layout === 'quote' && slide.source === undefined) count += 1;
    }
  }
  return count;
}

/** Replace the model's estimate with the measured length. */
export function withRealDuration(path: Path, totalMinutes: number): Path {
  return { ...path, totalMinutes };
}

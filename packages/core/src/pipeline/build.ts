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
 * both key on `deckKey` and write the same JobStore, so they are interchangeable
 * and resume across each other.
 */
import type { LlmProvider } from '../llm/types';
import type { ChapterNote, NodeDeck, Path, PathNode } from '../types';
import { type JobOptions, type JobResult, type JobStore, runJob } from './job';
import { fingerprint } from './fingerprint';
import type { ContentLocale } from '../parse/language';
import { isRecap, makeRecapDeck } from './recap';
import { makeDeck } from './slides';
import { DEFAULT_VOICE, deckAudioPath, type Narrator, type TtsOptions } from './tts';
import { CairnError } from '../errors';

export interface BuildOptions extends JobOptions, TtsOptions {
  /** The book's own language; the slides and narration come back in it. */
  readonly locale?: ContentLocale;
}

export interface BuildResult {
  readonly decks: readonly NodeDeck[];
  readonly totalMinutes: number;
  readonly job: JobResult<NodeDeck>;
  /** Quote slides whose text was not found verbatim in any chapter note. */
  readonly unsourcedQuotes: number;
}

/**
 * The cache key for one station's deck, and the name of its audio file.
 *
 * Derived from what the deck is made of, never from the station's position.
 * `reduce` re-runs on every generation and the model is not deterministic, so
 * `n0` routinely means a different station than it did last time — and the audio
 * directory is shared by every budget, so a positional name let one budget's
 * synthesis overwrite another's. Both failures land the same way: the right
 * subtitles playing over the wrong voice track.
 *
 * The station id stays as a prefix for legibility when reading the cache dir;
 * only the fingerprint decides reuse.
 */
export function deckKey(node: PathNode, voice?: string): string {
  return `${node.id}-${fingerprint({
    title: node.title,
    kind: node.kind,
    brief: node.brief,
    keyPoints: node.keyPoints,
    sourceChapters: node.sourceChapters,
    estMinutes: node.estMinutes,
    voice: voice ?? DEFAULT_VOICE,
  })}`;
}

/**
 * Build one station. Shared by the batch runner and the scheduler so the two
 * paths cannot drift in what a deck is, or in where its audio lands.
 */
/** What synthesis needs, plus the language the content itself is written in. */
export interface NodeBuildOptions extends TtsOptions {
  readonly locale?: ContentLocale;
}

export async function buildNode(
  node: PathNode,
  path: Path,
  byChapter: ReadonlyMap<number, ChapterNote>,
  audioDir: string,
  provider: LlmProvider,
  narrator: Narrator,
  options: NodeBuildOptions = {},
): Promise<NodeDeck> {
  const locale = options.locale ?? 'zh';
  const draft = isRecap(node)
    // The closing station recaps the path, so its material is the other
    // stations, not the book. Sending it the chapters its sourceChapters point
    // at would be the whole book in one prompt.
    ? await makeRecapDeck(
      node, path.nodes.filter((n) => !isRecap(n)), path.title, provider, options.signal, locale,
    )
    : await makeDeck(node, chapterNotes(node, byChapter), provider, options.signal, locale);

  return narrator.speak(draft, deckAudioPath(audioDir, deckKey(node, options.voice)), options);
}

function chapterNotes(
  node: PathNode,
  byChapter: ReadonlyMap<number, ChapterNote>,
): readonly ChapterNote[] {
  const notes = node.sourceChapters
    .map((idx) => byChapter.get(idx))
    .filter((n): n is ChapterNote => n !== undefined);

  if (notes.length === 0) {
    throw new CairnError('missing_source_chapter', { n: node.idx + 1, title: node.title });
  }
  return notes;
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
    path.nodes.map((node) => ({ id: deckKey(node, options.voice), input: node })),
    async (node) => buildNode(node, path, byChapter, audioDir, provider, narrator, options),
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

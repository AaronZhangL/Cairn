/**
 * Build stage: turn every station into a playable deck.
 *
 * Runs slides + tts per node through runJob, so a book interrupted halfway
 * resumes instead of re-spending on decks that already exist.
 *
 * Also replaces the path's advertised length with the real one. `estMinutes`
 * is what the model intended; audio duration is what the reader actually gets,
 * and only the latter should be shown.
 */
import type { LlmProvider } from '../llm/types';
import type { ChapterNote, NodeDeck, Path, PathNode } from '../types';
import { type JobOptions, type JobResult, type JobStore, runJob } from './job';
import { fingerprint } from './fingerprint';
import { makeDeck } from './slides';
import { DEFAULT_VOICE, deckAudioPath, synthesize } from './tts';

export interface BuildOptions extends JobOptions {
  readonly voice?: string;
}

export interface BuildResult {
  readonly decks: readonly NodeDeck[];
  readonly totalMinutes: number;
  readonly job: JobResult<NodeDeck>;
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

export async function buildDecks(
  path: Path,
  notes: readonly ChapterNote[],
  audioDir: string,
  provider: LlmProvider,
  store: JobStore<NodeDeck>,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const byChapter = new Map(notes.map((n) => [n.idx, n]));

  const job = await runJob(
    path.nodes.map((node) => ({ id: deckKey(node, options.voice), input: node })),
    async (node) => buildOne(node, byChapter, audioDir, provider, options),
    store,
    { ...options, concurrency: options.concurrency ?? provider.suggestedConcurrency },
  );

  const order = new Map(path.nodes.map((n, i) => [n.id, i]));
  const decks = [...job.results.values()].sort(
    (a, b) => (order.get(a.nodeId) ?? 0) - (order.get(b.nodeId) ?? 0),
  );

  return {
    decks,
    totalMinutes: Math.round(decks.reduce((sum, d) => sum + d.durationMs, 0) / 60_000),
    job,
  };
}

async function buildOne(
  node: PathNode,
  byChapter: ReadonlyMap<number, ChapterNote>,
  audioDir: string,
  provider: LlmProvider,
  options: BuildOptions,
): Promise<NodeDeck> {
  const notes = node.sourceChapters
    .map((idx) => byChapter.get(idx))
    .filter((n): n is ChapterNote => n !== undefined);

  if (notes.length === 0) {
    throw new Error(`第 ${node.idx + 1} 站「${node.title}」的溯源章节不存在`);
  }

  const draft = await makeDeck(node, notes, provider, options.signal);
  return synthesize(draft, deckAudioPath(audioDir, deckKey(node, options.voice)), {
    voice: options.voice,
    signal: options.signal,
  });
}

/** Replace the model's estimate with the measured length. */
export function withRealDuration(path: Path, result: BuildResult): Path {
  return { ...path, totalMinutes: result.totalMinutes };
}

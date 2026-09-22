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
import type { ChapterNote, DraftDeck, NodeDeck, Path, PathNode } from '../types';
import { type JobOptions, type JobResult, type JobStore, runJob } from './job';
import { isRecap, makeRecapDeck } from './recap';
import { makeDeck } from './slides';
import { deckAudioPath, synthesize } from './tts';

export interface BuildOptions extends JobOptions {
  readonly voice?: string;
}

export interface BuildResult {
  readonly decks: readonly NodeDeck[];
  readonly totalMinutes: number;
  readonly job: JobResult<NodeDeck>;
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
    path.nodes.map((node) => ({ id: node.id, input: node })),
    async (node) => (isRecap(node)
      ? buildRecap(node, path, audioDir, provider, options)
      : buildOne(node, byChapter, audioDir, provider, options)),
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
  return speak(draft, node, audioDir, options);
}

/** The closing station recaps the path, so its material is the other stations, not the book. */
async function buildRecap(
  node: PathNode,
  path: Path,
  audioDir: string,
  provider: LlmProvider,
  options: BuildOptions,
): Promise<NodeDeck> {
  const stations = path.nodes.filter((n) => !isRecap(n));
  const draft = await makeRecapDeck(node, stations, path.title, provider, options.signal);
  return speak(draft, node, audioDir, options);
}

function speak(
  draft: DraftDeck,
  node: PathNode,
  audioDir: string,
  options: BuildOptions,
): Promise<NodeDeck> {
  return synthesize(draft, deckAudioPath(audioDir, node.id), {
    voice: options.voice,
    signal: options.signal,
  });
}

/** Replace the model's estimate with the measured length. */
export function withRealDuration(path: Path, result: BuildResult): Path {
  return { ...path, totalMinutes: result.totalMinutes };
}

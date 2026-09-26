/** Model-judged checks on one path, or on two against each other. Each is one call. */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ChapterNote } from '../types';
import {
  COHERENCE_SYSTEM, COVERAGE_SYSTEM, coherenceUser, coverageUser, FAITHFUL_SYSTEM, faithfulUser,
  IDEAS_SYSTEM, ideasUser, PAIRWISE_SYSTEM, pairwiseUser, type Proposal,
} from './prompts';

export const COHERENCE_MODES = ['repeat', 'order', 'salience', 'grouping'] as const;
export type CoherenceMode = (typeof COHERENCE_MODES)[number];

export interface Coverage {
  /** Share of the answer key's ideas the path covers. */
  readonly share: number;
  readonly missing: readonly string[];
}

export interface Faithfulness {
  /** Share of stations with no unsupported claim. */
  readonly share: number;
  readonly unsupported: readonly { readonly station: string; readonly claim: string }[];
}

export type Coherence = Readonly<Record<CoherenceMode, { readonly pass: boolean; readonly note: string }>>;

export type Outcome = 'candidate' | 'baseline' | 'tie';

export interface Comparison {
  /** A win needs the same verdict with the paths in both orders; a split verdict is a tie. */
  readonly outcome: Outcome;
  readonly reasons: readonly string[];
}

const IDEAS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ideas'],
  properties: { ideas: { type: 'array', items: { type: 'string' } } },
} as const;

const COVERAGE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['ideas'],
  properties: {
    ideas: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['index', 'covered', 'station'],
        properties: { index: { type: 'integer' }, covered: { type: 'boolean' }, station: { type: 'string' } },
      },
    },
  },
} as const;

const FAITHFUL_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['stations'],
  properties: {
    stations: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'unsupported'],
        properties: { id: { type: 'string' }, unsupported: { type: 'array', items: { type: 'string' } } },
      },
    },
  },
} as const;

const MODE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['pass', 'note'],
  properties: { pass: { type: 'boolean' }, note: { type: 'string' } },
} as const;

const COHERENCE_SCHEMA = {
  type: 'object', additionalProperties: false, required: [...COHERENCE_MODES],
  properties: Object.fromEntries(COHERENCE_MODES.map((m) => [m, MODE_SCHEMA])),
} as const;

const PAIRWISE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['winner', 'reason'],
  properties: { winner: { type: 'string', enum: ['A', 'B', 'tie'] }, reason: { type: 'string' } },
} as const;

export async function extractIdeas(
  notes: readonly ChapterNote[], count: number, provider: LlmProvider,
): Promise<readonly string[]> {
  const raw = await provider.complete({
    label: 'eval:ideas', system: IDEAS_SYSTEM, prompt: ideasUser(notes, count), schema: IDEAS_SCHEMA,
  });
  return strings(parseJsonOutput<{ ideas?: unknown }>(raw).ideas).slice(0, count);
}

export async function checkCoverage(
  ideas: readonly string[], proposal: Proposal, provider: LlmProvider,
): Promise<Coverage> {
  if (ideas.length === 0) return { share: 0, missing: [] };
  const raw = await provider.complete({
    label: 'eval:coverage', system: COVERAGE_SYSTEM, prompt: coverageUser(ideas, proposal), schema: COVERAGE_SCHEMA,
  });
  const rows = arrayOf(parseJsonOutput<{ ideas?: unknown }>(raw).ideas);
  const covered = new Set(
    rows.filter((r) => r.covered === true && Number.isInteger(r.index)).map((r) => Number(r.index)),
  );
  // An idea the judge skipped counts as missed, so a lazy reply cannot inflate the share
  const missing = ideas.filter((_, i) => !covered.has(i));
  return { share: (ideas.length - missing.length) / ideas.length, missing };
}

export async function checkFaithfulness(
  notes: readonly ChapterNote[], proposal: Proposal, provider: LlmProvider,
): Promise<Faithfulness> {
  if (proposal.nodes.length === 0) return { share: 0, unsupported: [] };
  const raw = await provider.complete({
    label: 'eval:faithful', system: FAITHFUL_SYSTEM, prompt: faithfulUser(notes, proposal), schema: FAITHFUL_SCHEMA,
  });
  const ids = new Set(proposal.nodes.map((n) => n.id));
  const unsupported = arrayOf(parseJsonOutput<{ stations?: unknown }>(raw).stations)
    .filter((s) => typeof s.id === 'string' && ids.has(s.id))
    .flatMap((s) => strings(s.unsupported).map((claim) => ({ station: String(s.id), claim })));
  const flagged = new Set(unsupported.map((u) => u.station)).size;
  return { share: (proposal.nodes.length - flagged) / proposal.nodes.length, unsupported };
}

export async function checkCoherence(
  notes: readonly ChapterNote[], proposal: Proposal, provider: LlmProvider,
): Promise<Coherence> {
  const raw = await provider.complete({
    label: 'eval:coherence', system: COHERENCE_SYSTEM, prompt: coherenceUser(notes, proposal), schema: COHERENCE_SCHEMA,
  });
  const parsed = parseJsonOutput<Record<string, { pass?: unknown; note?: unknown } | undefined>>(raw);
  const entries = COHERENCE_MODES.map((mode) => {
    const verdict = parsed[mode];
    // A mode the judge did not answer is not a pass
    return [mode, { pass: verdict?.pass === true, note: typeof verdict?.note === 'string' ? verdict.note : '' }];
  });
  return Object.fromEntries(entries) as Coherence;
}

export async function comparePaths(
  notes: readonly ChapterNote[], budget: string, candidate: Proposal, baseline: Proposal, provider: LlmProvider,
): Promise<Comparison> {
  const ask = async (first: Proposal, second: Proposal, order: string) => {
    const raw = await provider.complete({
      label: `eval:pairwise.${order}`, system: PAIRWISE_SYSTEM,
      prompt: pairwiseUser(notes, budget, first, second), schema: PAIRWISE_SCHEMA,
    });
    const parsed = parseJsonOutput<{ winner?: unknown; reason?: unknown }>(raw);
    return { winner: parsed.winner, reason: typeof parsed.reason === 'string' ? parsed.reason : '' };
  };

  const [forward, swapped] = await Promise.all([
    ask(candidate, baseline, 'cb'),
    ask(baseline, candidate, 'bc'),
  ]);
  const first: Outcome = forward.winner === 'A' ? 'candidate' : forward.winner === 'B' ? 'baseline' : 'tie';
  const second: Outcome = swapped.winner === 'A' ? 'baseline' : swapped.winner === 'B' ? 'candidate' : 'tie';
  return { outcome: first === second ? first : 'tie', reasons: [forward.reason, swapped.reason] };
}

const strings = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];

const arrayOf = (v: unknown): readonly Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null) : [];

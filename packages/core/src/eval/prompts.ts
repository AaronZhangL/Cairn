/**
 * Judge prompts. Methods from docs/EVAL.md: FABLES-style claim checks,
 * QA-style coverage, BooookScore-style error modes, MT-Bench-style pairwise.
 */
import { systemPrompt, userPrompt } from '../pipeline/prompts/xml';
import type { ChapterNote, PathNode, Stage } from '../types';

export interface Proposal {
  readonly nodes: readonly PathNode[];
  readonly stages: readonly Stage[];
}

const GROUNDED = 'Judge only from the chapter notes given. Use nothing you already know about the book. '
  + 'Write every note and reason in the language the path is written in. Output JSON only.';

export const IDEAS_SYSTEM = systemPrompt(`You are preparing an answer key for judging reading paths through one book.
List the ideas a reader must come away with, most important first. Each idea is one self-contained sentence.
Prefer the book's central claims, concepts and turns over examples and asides. ${GROUNDED}`);

export const COVERAGE_SYSTEM = systemPrompt(`You are checking which ideas a reading path teaches.
An idea is covered when some station's title, brief or key points would leave the reader holding it. Mentioning a word is not covering it. ${GROUNDED}`);

export const FAITHFUL_SYSTEM = systemPrompt(`You are checking a reading path against the chapter notes it cites.
For each station, list every claim in its brief or key points that the notes of its cited chapters do not support.
A claim is supported when the notes state it or it follows directly from them. An empty list means the station is faithful. ${GROUNDED}`);

export const COHERENCE_SYSTEM = systemPrompt(`You are checking a reading path for four failure modes. Each passes or fails; there is no partial credit.
repeat: two stations teach substantially the same thing.
order: a station relies on an idea that only a later station introduces.
salience: a minor topic gets a station while a major idea in the notes gets none.
grouping: a stage title misdescribes the stations under it.
Fail a mode only with a concrete example, and name the stations in the note. ${GROUNDED}`);

export const PAIRWISE_SYSTEM = systemPrompt(`You are choosing the better of two reading paths through the same book, for the same reading budget.
You see each path as an outline: stages, station titles, minutes and the chapters each station draws on. Judge the choice and the order — what the budget is spent on, whether it reaches what matters most in the notes, whether it builds understanding in a sensible order, whether it repeats itself.
More stations is not merit. Where neither is clearly better, answer tie. ${GROUNDED}`);

export const ideasUser = (notes: readonly ChapterNote[], count: number): string =>
  userPrompt(`List the ${count} most important ideas of this book.`, notesDigest(notes));

export const coverageUser = (ideas: readonly string[], proposal: Proposal): string =>
  userPrompt(
    'For each numbered idea, say whether the path covers it and which station does.',
    `<ideas>\n${ideas.map((idea, i) => `${i}. ${idea}`).join('\n')}\n</ideas>\n<path>\n${renderPath(proposal)}\n</path>`,
  );

export const faithfulUser = (notes: readonly ChapterNote[], proposal: Proposal): string =>
  userPrompt(
    'Check every station against the notes of the chapters it cites.',
    `<notes>\n${notesDigest(notes)}\n</notes>\n<path>\n${renderPath(proposal)}\n</path>`,
  );

export const coherenceUser = (notes: readonly ChapterNote[], proposal: Proposal): string =>
  userPrompt(
    'Check this path for each failure mode.',
    `<notes>\n${notesDigest(notes)}\n</notes>\n<path>\n${renderPath(proposal)}\n</path>`,
  );

export const pairwiseUser = (
  notes: readonly ChapterNote[], budget: string, first: Proposal, second: Proposal,
): string =>
  userPrompt(
    `Both paths were made for this budget: ${budget}. Which is better, A or B?`,
    `<notes>\n${notesDigest(notes)}\n</notes>\n<path_a>\n${renderOutline(first)}\n</path_a>\n<path_b>\n${renderOutline(second)}\n</path_b>`,
  );

export function notesDigest(notes: readonly ChapterNote[]): string {
  return notes
    .map((n) => [`[${n.idx}] ${n.title}`, `  ${n.gist}`, ...n.keyPoints.map((k) => `  - ${k}`)].join('\n'))
    .join('\n\n');
}

/**
 * The pairwise judge sees outlines only. Shown full paths it preferred the wordier
 * one nine times in ten whatever else differed (docs/EVAL.md, "Length bias"), and
 * the wording is not reduce's job: faithfulness is judged elsewhere, station by station.
 */
export function renderOutline({ nodes, stages }: Proposal): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return stages
    .map((stage) => [
      `Stage: ${stage.title}`,
      ...stage.nodeIds.flatMap((id) => {
        const n = byId.get(id);
        return n ? [`  [${n.id}] ${n.title} (${n.estMinutes} min, chapters ${n.sourceChapters.join(',')})`] : [];
      }),
    ].join('\n'))
    .join('\n\n');
}

export function renderPath({ nodes, stages }: Proposal): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  return stages
    .map((stage) => {
      const stations = stage.nodeIds.flatMap((id) => {
        const n = byId.get(id);
        if (!n) return [];
        return [
          `  [${n.id}] ${n.title} (${n.kind}, ${n.estMinutes} min, chapters ${n.sourceChapters.join(',')})`,
          `    ${n.brief}`,
          ...n.keyPoints.map((k) => `    - ${k}`),
        ];
      });
      return [`Stage: ${stage.title}`, ...stations].join('\n');
    })
    .join('\n\n');
}

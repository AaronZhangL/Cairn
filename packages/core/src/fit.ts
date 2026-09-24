/**
 * How much room a slide field has, in display units.
 *
 * Slide text comes from a model and has no length limit, but every size in
 * slide.css is a fraction of the stage, so a long string overflows instead of
 * shrinking. One budget per field, derived as
 * `available width / font size * allowed lines`, lets the renderer step type
 * down a rung and lets slides.ts drop what no rung would fit. See DESIGN.md.
 */
import { units } from './pipeline/caption';

export type FitField =
  | 'title' | 'kicker' | 'subtitle' | 'heading' | 'point'
  | 'value' | 'label' | 'note' | 'quote' | 'cite'
  | 'paneTitle' | 'panePoint' | 'step'
  | 'timelineMark' | 'timelineText'
  | 'matrixHead' | 'matrixAspect' | 'matrixCell'
  | 'relationNode' | 'relationHow'
  | 'cycleStep' | 'pyramidLevel'
  | 'quadrantName' | 'quadrantText' | 'quadrantPole'
  | 'overlapSet' | 'overlapMeet'
  | 'causeEffect' | 'causeGroup' | 'causeItem'
  | 'aside';

/** Content width is 86cqw: the 100cqw stage less `.s` padding of 7cqw a side. */
export const BUDGETS: Readonly<Record<FitField, number>> = {
  /** `.s-h1` 7.4cqw, full width, 2 lines. */
  title: 23,
  /** `.s-kicker` 1.5cqw — a pill that wraps has stopped being a tag long before it runs out of width. */
  kicker: 12,
  /** `.s-sub` 2.1cqw, capped at 62cqw by `max-width`, 2 lines. */
  subtitle: 59,
  /** `.s-h2` 3cqw, full width, 2 lines. */
  heading: 57,
  /** `.s-ptext` 2.6cqw beside a 4.4cqw mark and 2.2cqw gap, 2 lines. */
  point: 61,
  /** `.s-bar-v` 5cqw, one line, column capped at 32cqw by `fit-content`. */
  value: 6,
  /** `.s-bar-l` 1.6cqw in the bar column, one line. */
  label: 32,
  /** `.s-note` 1.6cqw, full width, one line. */
  note: 53,
  /** `.s-quote` 3.4cqw indented 3.45cqw, 5 lines — past that it reaches the caption band. */
  quote: 121,
  /** `.s-cite` 1.6cqw indented 3.45cqw, one line. */
  cite: 51,
  /** `.s-pane-t` 2.2cqw beside a 3.4cqw icon and 1.3cqw gap, one line. */
  paneTitle: 13,
  /** `.s-pane li` 1.9cqw in a 34.8cqw pane less a 1.8cqw mark, 2 lines. */
  panePoint: 34,
  /** `.s-node-t` 2.2cqw less the node mark and pill padding, one line. */
  step: 35,
  /** `.s-tl-mark` 1.8cqw in a 14cqw spine column, one line. */
  timelineMark: 8,
  /** `.s-tl-text` 2cqw in the 66cqw beside the spine, 2 lines. */
  timelineText: 66,
  /** `.s-mx-head` 2cqw in a 28cqw column, one line. */
  matrixHead: 14,
  /** `.s-mx-aspect` 1.7cqw in a 22cqw column, one line. */
  matrixAspect: 13,
  /** `.s-mx-cell` 1.9cqw in a 28cqw column, 2 lines. */
  matrixCell: 29,
  /** `.s-rel-node` 2cqw in a 24cqw chip, one line. */
  relationNode: 12,
  /** `.s-rel-how` 1.5cqw between two chips, one line. */
  relationHow: 10,
  /** `.s-cy-node` 1.9cqw in a chip capped at 24cqw less 2.8cqw padding, one line — six chips clear each other at that width. */
  cycleStep: 11,
  /** `.s-py-label` 2cqw beside a 26cqw pyramid and 2cqw gap, one line. */
  pyramidLevel: 29,
  /** `.s-qd-name` 2cqw in a ~33cqw cell, one line. */
  quadrantName: 16,
  /** `.s-qd-text` 1.6cqw in the same cell, 2 lines. */
  quadrantText: 41,
  /** `.s-qd-pole` 1.5cqw in the 11cqw axis column, one line. */
  quadrantPole: 7,
  /** `.s-ov-set` 1.8cqw capped at 18cqw beside its circle, 2 lines. */
  overlapSet: 20,
  /** `.s-ov-meet` 1.9cqw in a pill capped at 18cqw less 2.6cqw padding, 2 lines. */
  overlapMeet: 16,
  /** `.s-fb-effect` 2cqw in a 17cqw box less 2.4cqw padding, 3 lines. */
  causeEffect: 21,
  /** `.s-fb-name` 1.9cqw in the ~28cqw beside a bone, one line. */
  causeGroup: 14,
  /** `.s-fb-cause` 1.6cqw in the same column, one line. */
  causeItem: 17,
  /** `.s-aside` 1.7cqw capped at 60cqw less its 3cqw lead-in and 1.2cqw gap, one line. */
  aside: 32,
};

const STEP_1 = 1 / 0.8;
const STEP_2 = 1 / 0.62;

/** Past the last rung no size fits, so slides.ts drops the slide instead. */
export const HARD_CAP = STEP_2;

/** 0 = fits as designed, 1 and 2 = step the type down a rung. */
export type FitStep = 0 | 1 | 2;

export function fitStep(width: number, budget: number): FitStep {
  if (budget <= 0) return 0;
  const ratio = width / budget;
  if (ratio <= 1) return 0;
  return ratio <= STEP_1 ? 1 : 2;
}

export function fitOf(text: string, field: FitField): FitStep {
  return fitStep(units(text), BUDGETS[field]);
}

/** One step for a whole list: three claims at three sizes read as emphasis nobody intended. */
export function fitAll(texts: readonly string[], field: FitField): FitStep {
  return texts.reduce<FitStep>((worst, text) => {
    const step = fitOf(text, field);
    return step > worst ? step : worst;
  }, 0);
}

export function overBudget(text: string, field: FitField): boolean {
  return units(text) > BUDGETS[field] * HARD_CAP;
}

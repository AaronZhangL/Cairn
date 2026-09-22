/**
 * How much room a slide field has, in display units.
 *
 * Every string on a slide comes from the model, and model output has no length
 * limit. The layouts size type as a fixed fraction of the stage (`cqw`), so a
 * long string does not shrink — it overflows its box, runs under a neighbour,
 * or pushes the slide past 16:9. One station rendered "32华氏度" underneath its
 * own bar because the value column was 13cqw wide and the value was not.
 *
 * The fix is one number per field: how many display units fit at the designed
 * size. Two consumers share it, the same way `icons.ts` is shared — core owns
 * the vocabulary, the renderer owns the ink:
 *
 *   - packages/ui steps the type down a rung when a string runs over
 *     (`fitOf` / `fitAll` -> a `data-fit` attribute -> a CSS ladder)
 *   - pipeline/slides.ts drops a slide outright when a string is past saving
 *     (`overBudget`)
 *
 * The budgets are derived, not guessed. The stage is 16:9 and `.s` pads 7cqw
 * left and right, so a full-width line has 86cqw to work with, and:
 *
 *     budget = available width (cqw) / font size (cqw) * allowed lines
 *
 * Each entry below shows its own arithmetic. Re-derive when the matching font
 * size in `slide.css` changes — a budget that no longer matches its layout is
 * worse than none, because it silently stops firing.
 */
import { units } from './pipeline/caption';

export type FitField =
  | 'title' | 'kicker' | 'subtitle' | 'heading' | 'point'
  | 'value' | 'label' | 'note' | 'quote' | 'cite'
  | 'paneTitle' | 'panePoint' | 'step';

export const BUDGETS: Readonly<Record<FitField, number>> = {
  /** `.s-h1` 7.4cqw, full width, 2 lines: 86 / 7.4 * 2 */
  title: 23,
  /**
   * `.s-kicker` 1.5cqw. Geometry is not the constraint here — a pill that wraps
   * has already stopped being a tag, well before it runs out of width.
   */
  kicker: 12,
  /** `.s-sub` 2.1cqw, capped at 62cqw by `max-width`, 2 lines: 62 / 2.1 * 2 */
  subtitle: 59,
  /** `.s-h2` 3cqw, full width, 2 lines: 86 / 3 * 2 */
  heading: 57,
  /** `.s-ptext` 2.6cqw beside a 4.4cqw mark + 2.2cqw gap, 2 lines: 79.4 / 2.6 * 2 */
  point: 61,
  /** `.s-bar-v` 5cqw, one line, column capped at 32cqw by `fit-content`: 32 / 5 */
  value: 6,
  /** `.s-bar-l` 1.6cqw in the bar column, one line: 51.6 / 1.6 */
  label: 32,
  /** `.s-note` 1.6cqw, full width, one line: 86 / 1.6 */
  note: 53,
  /**
   * `.s-quote` 3.4cqw indented 3.45cqw, 5 lines: 82.55 / 3.4 * 5. Height is the
   * real limit here, not width — beyond five lines the quote reaches the
   * caption band.
   */
  quote: 121,
  /** `.s-cite` 1.6cqw indented 3.45cqw, one line: 82.55 / 1.6 */
  cite: 51,
  /** `.s-pane-t` 2.2cqw beside a 3.4cqw icon + 1.3cqw gap, one line: 30.1 / 2.2 */
  paneTitle: 13,
  /** `.s-pane li` 1.9cqw in a 34.8cqw pane less 1.8cqw mark, 2 lines: 33 / 1.9 * 2 */
  panePoint: 34,
  /** `.s-node-t` 2.2cqw less the node mark and pill padding, one line: 78.7 / 2.2 */
  step: 35,
};

/**
 * The rungs of the ladder, as ratios of the budget.
 *
 * They are the reciprocals of the font scales in `slide.css` (0.8 and 0.62), so
 * a string that lands on a rung actually fits after the step down. Changing one
 * without the other reintroduces the overflow at a smaller size.
 */
const STEP_1 = 1 / 0.8;
const STEP_2 = 1 / 0.62;

/** Past this there is no rung left, and the slide is dropped in `slides.ts`. */
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

/**
 * One step for a whole list, taken from its longest item.
 *
 * Sizing each item on its own would set three claims in three sizes, which
 * reads as emphasis nobody intended. A list that steps down together is still
 * a list.
 */
export function fitAll(texts: readonly string[], field: FitField): FitStep {
  return texts.reduce<FitStep>((worst, text) => {
    const step = fitOf(text, field);
    return step > worst ? step : worst;
  }, 0);
}

/** Past every rung: no size makes this fit, so the slide carrying it is dropped. */
export function overBudget(text: string, field: FitField): boolean {
  return units(text) > BUDGETS[field] * HARD_CAP;
}

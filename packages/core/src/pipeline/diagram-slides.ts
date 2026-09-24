/**
 * The five layouts drawn from diagram material: cycle, pyramid, quadrant,
 * overlap and causes. Same contract as the rest of slides.ts — a slide missing
 * a required part, or with text no rung of the fit ladder holds, is dropped.
 */
import type { Slide } from '../types';
import { CAUSE_GROUPS, QUADRANT_CELLS, causeGroups, quadrantCorners } from './material';
import {
  anyOverBudget, extras, fitted, focusOf, nullableInt, nullableStr, str, strList, strs, variant,
} from './slide-fields';

const shared = { heading: nullableStr, aside: nullableStr } as const;

export const DIAGRAM_VARIANTS = [
  variant('cycle', { steps: strList, focus: nullableInt, ...shared }),
  variant('pyramid', { levels: strList, focus: nullableInt, ...shared }),
  variant('quadrant', {
    xLow: str, xHigh: str, yLow: str, yHigh: str, cells: QUADRANT_CELLS,
    focus: nullableInt, ...shared,
  }),
  variant('overlap', { sets: strList, meet: str, ...shared }),
  variant('causes', { effect: str, groups: CAUSE_GROUPS, focus: nullableInt, ...shared }),
] as const;

/** Past these the figure stops being readable at a glance; see DESIGN.md. */
const MOST_STEPS = 6;
const MOST_LEVELS = 5;
const MOST_GROUPS = 4;
const MOST_CAUSES = 3;

export function toDiagramSlide(item: Record<string, unknown>): Slide | undefined {
  switch (item.layout) {
    case 'cycle': {
      const steps = strs(item.steps).slice(0, MOST_STEPS);
      if (steps.length < 3 || anyOverBudget(steps, 'cycleStep')) return undefined;
      return { layout: 'cycle', steps, ...focusOf(item.focus, steps.length), ...extras(item) };
    }
    case 'pyramid': {
      const levels = strs(item.levels).slice(0, MOST_LEVELS);
      if (levels.length < 3 || anyOverBudget(levels, 'pyramidLevel')) return undefined;
      return { layout: 'pyramid', levels, ...focusOf(item.focus, levels.length), ...extras(item) };
    }
    case 'quadrant':
      return toQuadrant(item);
    case 'overlap': {
      const sets = strs(item.sets);
      const meet = fitted(item.meet, 'overlapMeet');
      if (!meet || sets.length < 2 || sets.length > 3) return undefined;
      if (anyOverBudget(sets, 'overlapSet')) return undefined;
      return { layout: 'overlap', sets, meet, ...extras(item) };
    }
    case 'causes': {
      const effect = fitted(item.effect, 'causeEffect');
      const groups = causeGroups(item.groups)
        .slice(0, MOST_GROUPS)
        .map((g) => ({ name: g.name, causes: g.causes.slice(0, MOST_CAUSES) }));
      if (!effect || groups.length < 2) return undefined;
      if (anyOverBudget(groups.map((g) => g.name), 'causeGroup')) return undefined;
      if (anyOverBudget(groups.flatMap((g) => g.causes), 'causeItem')) return undefined;
      return { layout: 'causes', effect, groups, ...focusOf(item.focus, groups.length), ...extras(item) };
    }
    default:
      return undefined;
  }
}

/** The cells are reordered for reading, so the focus is carried by the cell, not the index. */
function toQuadrant(item: Record<string, unknown>): Slide | undefined {
  const corners = quadrantCorners(item.cells);
  const poles = [item.xLow, item.xHigh, item.yLow, item.yHigh].map((p) => fitted(p, 'quadrantPole'));
  if (!corners || poles.some((p) => !p)) return undefined;
  if (anyOverBudget(corners.map((c) => c.name), 'quadrantName')) return undefined;
  if (anyOverBudget(corners.map((c) => c.text), 'quadrantText')) return undefined;

  const raw = Array.isArray(item.cells) ? item.cells : [];
  const wanted = Number.isInteger(item.focus) ? raw[item.focus as number] : undefined;
  const focusName = typeof wanted === 'object' && wanted !== null
    ? fitted((wanted as Record<string, unknown>).name, 'quadrantName')
    : '';
  const [xLow, xHigh, yLow, yHigh] = poles as [string, string, string, string];

  return {
    layout: 'quadrant',
    x: { low: xLow, high: xHigh },
    y: { low: yLow, high: yHigh },
    cells: corners.map((c) => ({ name: c.name, text: c.text })),
    ...focusOf(corners.findIndex((c) => c.name === focusName), corners.length),
    ...extras(item),
  };
}

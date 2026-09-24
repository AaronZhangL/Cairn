/**
 * Reading the diagram material out of a model reply: cycles, ranks, quadrants,
 * overlaps and causes. Shared by map, which extracts it from the book, and by
 * slides, which draws it — the shape rules are the same on both sides.
 */
import type {
  CauseGroup, ChapterCauses, ChapterCycle, ChapterOverlap, ChapterQuadrant, ChapterRank,
  Pole, QuadrantCorner,
} from '../types';

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

const texts = (v: unknown): readonly string[] =>
  (Array.isArray(v) ? v.map(text).filter((t) => t.length > 0) : []);

const objects = (v: unknown): readonly Record<string, unknown>[] =>
  (Array.isArray(v)
    ? v.filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    : []);

const pole = (v: unknown): Pole | undefined => (v === 'low' || v === 'high' ? v : undefined);

/** Reading order: top-left, top-right, bottom-left, bottom-right. High y is the top row. */
const CORNERS: readonly (readonly [Pole, Pole])[] = [
  ['low', 'high'], ['high', 'high'], ['low', 'low'], ['high', 'low'],
];

/**
 * All four corners in reading order, or nothing. A 2×2 with a corner missing or
 * doubled is not two dimensions crossed, whatever it is.
 */
export function quadrantCorners(value: unknown): readonly QuadrantCorner[] | undefined {
  const cells = objects(value).flatMap((c) => {
    const x = pole(c.x);
    const y = pole(c.y);
    const name = text(c.name);
    const body = text(c.text);
    return x && y && name && body ? [{ x, y, name, text: body }] : [];
  });
  const ordered = CORNERS.map(([x, y]) => cells.filter((c) => c.x === x && c.y === y));
  if (ordered.some((found) => found.length !== 1)) return undefined;
  return ordered.map((found) => found[0]!);
}

/** A group with no cause under it is a heading, not a cause. */
export function causeGroups(value: unknown): readonly CauseGroup[] {
  return objects(value).flatMap((g) => {
    const name = text(g.name);
    const causes = texts(g.causes);
    return name && causes.length > 0 ? [{ name, causes }] : [];
  });
}

export function toCycles(value: unknown): readonly ChapterCycle[] {
  return objects(value).flatMap((c) => {
    const title = text(c.title);
    const steps = texts(c.steps);
    return title && steps.length >= 3 ? [{ title, steps }] : [];
  });
}

export function toRanks(value: unknown): readonly ChapterRank[] {
  return objects(value).flatMap((r) => {
    const title = text(r.title);
    const levels = texts(r.levels);
    return title && levels.length >= 3 ? [{ title, levels }] : [];
  });
}

export function toQuadrants(value: unknown): readonly ChapterQuadrant[] {
  return objects(value).flatMap((q) => {
    const axes = {
      xLow: text(q.xLow), xHigh: text(q.xHigh), yLow: text(q.yLow), yHigh: text(q.yHigh),
    };
    const cells = quadrantCorners(q.cells);
    return cells && Object.values(axes).every(Boolean) ? [{ ...axes, cells }] : [];
  });
}

export function toOverlaps(value: unknown): readonly ChapterOverlap[] {
  return objects(value).flatMap((o) => {
    const sets = texts(o.sets);
    const meet = text(o.meet);
    return meet && sets.length >= 2 && sets.length <= 3 ? [{ sets, meet }] : [];
  });
}

export function toCauses(value: unknown): readonly ChapterCauses[] {
  return objects(value).flatMap((c) => {
    const effect = text(c.effect);
    const groups = causeGroups(c.groups);
    return effect && groups.length >= 2 ? [{ effect, groups }] : [];
  });
}

const str = { type: 'string' } as const;
const strList = { type: 'array', items: str } as const;
const poleEnum = { type: 'string', enum: ['low', 'high'] } as const;

const objectOf = (properties: Record<string, unknown>): Record<string, unknown> => ({
  type: 'object', additionalProperties: false, required: Object.keys(properties), properties,
});

export const QUADRANT_CELLS = {
  type: 'array',
  items: objectOf({ x: poleEnum, y: poleEnum, name: str, text: str }),
} as const;

export const CAUSE_GROUPS = {
  type: 'array',
  items: objectOf({ name: str, causes: strList }),
} as const;

/** The map stage's schema for this material, one entry per note field. */
export const MATERIAL_SCHEMA = {
  cycles: { type: 'array', items: objectOf({ title: str, steps: strList }) },
  ranks: { type: 'array', items: objectOf({ title: str, levels: strList }) },
  quadrants: {
    type: 'array',
    items: objectOf({ xLow: str, xHigh: str, yLow: str, yHigh: str, cells: QUADRANT_CELLS }),
  },
  overlaps: { type: 'array', items: objectOf({ sets: strList, meet: str }) },
  causes: { type: 'array', items: objectOf({ effect: str, groups: CAUSE_GROUPS }) },
} as const;

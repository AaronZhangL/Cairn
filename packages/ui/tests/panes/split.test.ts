import { describe, expect, test } from 'bun:test';
import {
  applyDrag, columnWidth, parseStored, toggle, RAIL,
  type SplitLimits, type SplitState,
} from '../../src/panes/split';

const LIMITS: SplitLimits = { min: 200, max: 400, collapseAt: 150 };
const open = (width: number): SplitState => ({ width, collapsed: false });

describe('applyDrag', () => {
  test('follows the pointer between the limits', () => {
    expect(applyDrag(open(264), 300, LIMITS)).toEqual({ width: 300, collapsed: false });
  });

  test('clamps rather than passing the limits', () => {
    expect(applyDrag(open(264), 900, LIMITS).width).toBe(400);
    expect(applyDrag(open(264), 170, LIMITS).width).toBe(200);
  });

  test('past the collapse point it collapses, keeping the width to restore', () => {
    expect(applyDrag(open(264), 40, LIMITS)).toEqual({ width: 264, collapsed: true });
  });

  test('dragging a collapsed pane back out reopens it at the new width', () => {
    const collapsed: SplitState = { width: 264, collapsed: true };
    expect(applyDrag(collapsed, 320, LIMITS)).toEqual({ width: 320, collapsed: false });
  });

  test('a nonsense width changes nothing', () => {
    const state = open(264);
    expect(applyDrag(state, Number.NaN, LIMITS)).toBe(state);
  });
});

describe('toggle and columnWidth', () => {
  test('collapsing and reopening returns the same width', () => {
    const state = open(310);
    expect(toggle(toggle(state))).toEqual(state);
  });

  test('a collapsed pane takes no width at all', () => {
    expect(columnWidth(open(310))).toBe(310);
    expect(columnWidth({ width: 310, collapsed: true })).toBe(RAIL);
    expect(RAIL).toBe(0);
  });
});

describe('parseStored', () => {
  const fallback = open(264);

  test('reads back what was written', () => {
    const state: SplitState = { width: 333, collapsed: true };
    expect(parseStored(JSON.stringify(state), fallback)).toEqual(state);
  });

  test('missing, junk, or a non-numeric width all fall back', () => {
    expect(parseStored(null, fallback)).toEqual(fallback);
    expect(parseStored('{oh no', fallback)).toEqual(fallback);
    expect(parseStored('{"width":"wide"}', fallback)).toEqual(fallback);
    expect(parseStored('{"collapsed":true}', fallback)).toEqual(fallback);
  });

  test('collapsed is only ever a boolean', () => {
    expect(parseStored('{"width":300,"collapsed":"yes"}', fallback))
      .toEqual({ width: 300, collapsed: false });
  });
});

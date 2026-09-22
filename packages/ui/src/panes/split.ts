/**
 * Side pane sizing.
 *
 * The rules are the ones an editor's sidebar has trained everyone to expect:
 * drag to resize within limits, drag past the low limit to collapse, and a
 * collapsed pane keeps the width it had so reopening restores it rather than
 * snapping to a default.
 *
 * Kept as plain functions with no React in sight, because the interesting part
 * is the arithmetic at the edges, and that is worth testing directly.
 */
export interface SplitLimits {
  readonly min: number;
  readonly max: number;
  /** Dragged narrower than this, the pane collapses instead of shrinking. */
  readonly collapseAt: number;
}

export interface SplitState {
  /** The width to restore to. Held through a collapse on purpose. */
  readonly width: number;
  readonly collapsed: boolean;
}

export const LEFT_LIMITS: SplitLimits = { min: 190, max: 460, collapseAt: 140 };
export const RIGHT_LIMITS: SplitLimits = { min: 260, max: 620, collapseAt: 190 };

/**
 * A collapsed pane keeps no width: the corner switch is what reopens it, so a
 * leftover strip would be decoration standing in the deck's light.
 */
export const RAIL = 0;

export const DEFAULT_LEFT: SplitState = { width: 264, collapsed: false };
export const DEFAULT_RIGHT: SplitState = { width: 340, collapsed: false };

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Where a drag leaves the pane. `requested` is the width the pointer implies. */
export function applyDrag(
  state: SplitState,
  requested: number,
  limits: SplitLimits,
): SplitState {
  if (!Number.isFinite(requested)) return state;
  // Collapsing keeps the old width: reopening should restore, not reset
  if (requested < limits.collapseAt) return { width: state.width, collapsed: true };
  return { width: clamp(requested, limits.min, limits.max), collapsed: false };
}

export function toggle(state: SplitState): SplitState {
  return { ...state, collapsed: !state.collapsed };
}

/** The grid column this pane occupies right now. */
export function columnWidth(state: SplitState): number {
  return state.collapsed ? RAIL : state.width;
}

/**
 * Read a stored size, ignoring anything that is not a size.
 *
 * Storage is per-viewer convenience: a blocked or cleared store must leave the
 * layout working, so every failure here falls back to the default.
 */
export function parseStored(raw: string | null, fallback: SplitState): SplitState {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<SplitState>;
    if (typeof value.width !== 'number' || !Number.isFinite(value.width)) return fallback;
    return { width: value.width, collapsed: value.collapsed === true };
  } catch {
    return fallback;
  }
}

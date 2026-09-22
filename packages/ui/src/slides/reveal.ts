/**
 * How much of a slide has been revealed at a given moment.
 *
 * A slide whose points all appear at once is read in two seconds and then sits
 * there for the remaining minute; by the time the voice reaches point three the
 * eye finished it long ago. Revealing in step with the narration keeps the two
 * together.
 *
 * The beats come from the narration cues, not from a timer, because speech pace
 * is not uniform — a long sentence and a short one take different real time, and
 * dividing the span evenly would drift away from the voice. Cues are already on
 * the deck, so this needs no new data and works on books generated before it
 * existed.
 */

/**
 * Progress through one slide's span, in [0, 1].
 *
 * `cueStarts` is every narration cue start on the whole timeline; only those
 * strictly inside the span count as beats. With no interior beat there is
 * nothing to step to, so it falls back to elapsed time.
 */
export function revealProgress(
  cueStarts: readonly number[],
  spanStartMs: number,
  spanEndMs: number,
  ms: number,
): number {
  const span = spanEndMs - spanStartMs;
  if (span <= 0) return 1;

  const beats = cueStarts.filter((t) => t > spanStartMs && t < spanEndMs);
  if (beats.length === 0) {
    return clamp01((ms - spanStartMs) / span);
  }

  const passed = beats.filter((t) => t <= ms).length;
  // +1 so the last beat lands short of 1 and the final item still has a step
  // of its own rather than appearing together with the one before it.
  return clamp01(passed / (beats.length + 1));
}

/**
 * How many of `total` items are visible at `progress`.
 *
 * The first item is always visible: a slide that starts empty reads as a
 * loading failure, not as a build.
 */
export function revealCount(total: number, progress: number): number {
  if (total <= 0) return 0;
  const shown = 1 + Math.floor(clamp01(progress) * total);
  return Math.min(shown, total);
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

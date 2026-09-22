import type { ReactElement } from 'react';

/**
 * Transport marks as geometry, not glyphs.
 *
 * `▶` and `❚❚` were text: their side bearings differ per font, macOS may even
 * resolve U+25B6 to a colour emoji, and neither sits on the box centre — which
 * is exactly what a play mark inside a circle makes obvious. Drawn here, the
 * shape is the same everywhere and its optical centre is ours to set.
 */

/**
 * A triangle's visual mass sits left of its bounding box, so the points lean right.
 *
 * The corners are rounded by stroking the same path as it is filled: a sharp
 * apex next to the pause bars' rounded ends read as two different families, and
 * at this size the point was the sharpest thing on screen. The path is inset by
 * half the stroke so the outer silhouette keeps its intended size.
 */
export function PlayMark({ size = 24 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M10 7.7 17.5 12 10 16.3Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Two bars are symmetric, so they take the true centre. */
export function PauseMark({ size = 24 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <rect x="8" y="5.5" width="2.9" height="13" rx="1.2" fill="currentColor" />
      <rect x="13.1" y="5.5" width="2.9" height="13" rx="1.2" fill="currentColor" />
    </svg>
  );
}

/** The boost state on the rate button: same lean, same rounding, doubled. */
export function FastMark({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
      fill="currentColor" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"
    >
      <path d="M4.7 7.7 10.8 12 4.7 16.3Z" />
      <path d="M13.2 7.7 19.3 12 13.2 16.3Z" />
    </svg>
  );
}

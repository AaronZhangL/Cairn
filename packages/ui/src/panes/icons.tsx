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
      <rect x="7.4" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" />
      <rect x="13" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" />
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

/** The menu's affordance. Stroked, so it stays legible where a text ▾ went thin. */
export function ChevronMark({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path
        d="M7 10.5 12 15.5 17 10.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Delete. A lid and a body, so it is not mistaken for the ✕ that dismisses things. */
export function TrashMark({ size = 16 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4.5 7h15" />
        <path d="M9.5 7V5.2h5V7" />
        <path d="M6.6 7l.8 11.2a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.4 7" />
        <path d="M10.4 10.6v6M13.6 10.6v6" />
      </g>
    </svg>
  );
}

/** The waves carry the state; the cone never moves, so muting reads as one object changing. */
export function VolumeMark({ size = 24, muted = false }: {
  size?: number;
  muted?: boolean;
}): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M4 9.2h3.4L12 5.4v13.2L7.4 14.8H4z" fill="currentColor" />
      {muted ? (
        <path
          d="M15.8 9.6 20.4 14.2M20.4 9.6 15.8 14.2"
          fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
        />
      ) : (
        <path
          d="M15.4 9.4a3.6 3.6 0 0 1 0 5.2M17.6 7a6.9 6.9 0 0 1 0 10"
          fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** Corners, not a glyph: `⛶` renders at a different size per font and may come back as emoji. */
export function FullscreenMark({ size = 22, exit = false }: {
  size?: number;
  exit?: boolean;
}): ReactElement {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    >
      {exit
        ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
    </svg>
  );
}

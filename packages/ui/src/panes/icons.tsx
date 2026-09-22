import type { ReactElement } from 'react';

/**
 * Transport marks as geometry, not glyphs.
 *
 * `▶` and `❚❚` were text: their side bearings differ per font, macOS may even
 * resolve U+25B6 to a colour emoji, and neither sits on the box centre — which
 * is exactly what a play mark inside a circle makes obvious. Drawn here, the
 * shape is the same everywhere and its optical centre is ours to set.
 */

/** A triangle's visual mass sits left of its bounding box, so the points lean right. */
export function PlayMark({ size = 24 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M9 5.6 19.2 12 9 18.4Z" fill="currentColor" />
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

/** The boost state on the rate button: same lean, doubled. */
export function FastMark({ size = 14 }: { size?: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false">
      <path d="M3.5 6 12 12 3.5 18Z" fill="currentColor" />
      <path d="M12 6 20.5 12 12 18Z" fill="currentColor" />
    </svg>
  );
}

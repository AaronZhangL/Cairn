import type { ReactElement } from 'react';
import type { IconName } from '@cairn/core/icons';
import { GLYPHS } from './glyphs';

/**
 * One pictogram, drawn from the local glyph table.
 *
 * No network, no image generation, no asset files: the paths are in the bundle,
 * so a glyph costs nothing to draw and looks identical every time. Size and
 * colour come from the caller's CSS (`width` on the element, `currentColor`),
 * which is what lets the same glyph sit inline with type at 1.5cqw and as a
 * watermark at 52cqw.
 */
export function Icon({ name, className }: { name: IconName; className?: string }): ReactElement {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {GLYPHS[name].map((part, i) =>
        part[0] === 'p'
          ? <path key={i} d={part[1]} />
          : <circle key={i} cx={part[1]} cy={part[2]} r={part[3]} />,
      )}
    </svg>
  );
}

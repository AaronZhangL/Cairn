import type { ReactElement } from 'react';

/**
 * The settings nav's marks.
 *
 * Hand-drawn in the same manner as `panes/icons.tsx` rather than pulled from an
 * icon package: one gear does not earn a dependency, and a second family beside
 * the existing one is exactly the inconsistency that makes an interface look
 * assembled. One size, one stroke width, no fills.
 */
const BOX = { width: 14, height: 14, viewBox: '0 0 24 24' } as const;
const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

export function GearMark(): ReactElement {
  return (
    <svg {...BOX} {...STROKE} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
    </svg>
  );
}

export function PaletteMark(): ReactElement {
  return (
    <svg {...BOX} {...STROKE} aria-hidden="true">
      <path d="M12 3a9 9 0 100 18c1.1 0 2-.9 2-2 0-1.4-1-1.7-1-2.7 0-.7.6-1.3 1.3-1.3H16a5 5 0 005-5c0-3.9-4-7-9-7z" />
      <circle cx="8" cy="11" r="1" />
      <circle cx="12" cy="8" r="1" />
      <circle cx="16" cy="10" r="1" />
    </svg>
  );
}

export function PlaybackMark(): ReactElement {
  return (
    <svg {...BOX} {...STROKE} aria-hidden="true">
      <path d="M5 4v16l7-4 7 4V4z" />
    </svg>
  );
}

export function WaveMark(): ReactElement {
  return (
    <svg {...BOX} {...STROKE} aria-hidden="true">
      <path d="M3 11v2M7 7v10M11 4v16M15 8v8M19 10v4" />
    </svg>
  );
}

export function ModelMark(): ReactElement {
  return (
    <svg {...BOX} {...STROKE} aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h6v6H9z" />
      <path d="M9 2v2M15 2v2M9 20v2M15 20v2M2 9h2M2 15h2M20 9h2M20 15h2" />
    </svg>
  );
}

export function KeyMark(): ReactElement {
  return (
    <svg {...BOX} {...STROKE} aria-hidden="true">
      <circle cx="8" cy="15" r="4" />
      <path d="M10.8 12.2L20 3M18 5l2 2M15 8l2 2" />
    </svg>
  );
}

export function CacheMark(): ReactElement {
  return (
    <svg {...BOX} {...STROKE} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </svg>
  );
}

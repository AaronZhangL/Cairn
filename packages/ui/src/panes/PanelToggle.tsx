import type { ReactElement } from 'react';

export interface PanelControl {
  readonly collapsed: boolean;
  readonly toggle: () => void;
}

/**
 * The sidebar switch, pinned to its own corner of the window.
 *
 * Not inside the pane it controls: a switch that disappears with the thing it
 * opens is a switch you cannot use, and one laid out by the pane's own header
 * moves the moment that header goes away. Both sides use the same box and the
 * same icon geometry, so they read as one pair. The filled block shows which
 * side folds away.
 */
export function PanelToggle({
  control, side, label, hint,
}: {
  control: PanelControl;
  side: 'left' | 'right';
  label: string;
  hint: string;
}): ReactElement {
  const { collapsed, toggle } = control;

  return (
    <button
      type="button"
      className={`panel-toggle ${side}${collapsed ? ' off' : ''}`}
      onClick={toggle}
      aria-pressed={!collapsed}
      aria-label={`${collapsed ? '展开' : '收起'}${label}`}
      title={`${collapsed ? '展开' : '收起'}${label} (${hint})`}
    >
      <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
        <rect
          x="1.5" y="2.5" width="13" height="11" rx="2"
          fill="none" stroke="currentColor" strokeWidth="1.3"
        />
        {/* The sliver that folds: filled while open, hollow once collapsed */}
        <rect
          x={side === 'left' ? 1.5 : 10.5} y="2.5" width="4" height="11"
          fill={collapsed ? 'none' : 'currentColor'}
          stroke="currentColor"
          strokeWidth="1.3"
          rx="2"
        />
      </svg>
    </button>
  );
}

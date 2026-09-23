import type { ReactElement } from 'react';
import type { Split } from './useSplit';
import { useT } from '../settings/SettingsProvider';

/**
 * The line between two panes: drag to resize, double-click to fold.
 *
 * One pixel wide, in the same colour as every other divider, with the grab area
 * supplied by a transparent overlay rather than by making the line itself thick.
 * A resize handle you can see is a handle that is shouting.
 */
export function Splitter({
  split, label,
}: {
  split: Split;
  label: string;
}): ReactElement {
  const t = useT();
  const { state, dragging, onGrab, toggleCollapsed } = split;

  return (
    <div
      className={dragging ? 'splitter dragging' : 'splitter'}
      onPointerDown={onGrab}
      onDoubleClick={toggleCollapsed}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      title={t.panel.splitterDrag(state.collapsed)}
    />
  );
}

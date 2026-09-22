import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  applyDrag, parseStored, toggle,
  type SplitLimits, type SplitState,
} from './split';

export interface Split {
  readonly state: SplitState;
  readonly dragging: boolean;
  /** Attach to a splitter's `onPointerDown`. */
  readonly onGrab: (e: ReactPointerEvent<HTMLElement>) => void;
  readonly toggleCollapsed: () => void;
}

/**
 * One resizable side pane.
 *
 * `edge` says which way the pane grows: a left pane's width is the pointer's x,
 * a right pane's is the distance from the window's right edge. Pointer capture
 * keeps the drag alive over the slide, which would otherwise swallow the moves.
 */
export function useSplit(
  key: string,
  initial: SplitState,
  limits: SplitLimits,
  edge: 'left' | 'right',
): Split {
  const [state, setState] = useState<SplitState>(() => read(key, initial));
  const [dragging, setDragging] = useState(false);
  const live = useRef(state);

  const commit = useCallback((next: SplitState) => {
    live.current = next;
    setState(next);
    write(key, next);
  }, [key]);

  const onGrab = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);

    const move = (ev: PointerEvent): void => {
      const requested = edge === 'left' ? ev.clientX : window.innerWidth - ev.clientX;
      commit(applyDrag(live.current, requested, limits));
    };
    const done = (): void => {
      setDragging(false);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', done);
      handle.removeEventListener('pointercancel', done);
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', done);
    handle.addEventListener('pointercancel', done);
  }, [commit, limits, edge]);

  const toggleCollapsed = useCallback(() => commit(toggle(live.current)), [commit]);

  // A drag over the whole window should not select text on the way past
  useEffect(() => {
    if (!dragging) return;
    const before = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => { document.body.style.userSelect = before; };
  }, [dragging]);

  return { state, dragging, onGrab, toggleCollapsed };
}

function read(key: string, fallback: SplitState): SplitState {
  try {
    return parseStored(window.localStorage.getItem(key), fallback);
  } catch {
    return fallback;
  }
}

function write(key: string, state: SplitState): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // A pane that cannot remember its width still works; nothing to report
  }
}

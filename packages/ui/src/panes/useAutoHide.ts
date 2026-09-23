import { useCallback, useEffect, useRef, useState } from 'react';

/** Long enough to read a value off the bar, short enough not to sit on the slide. */
export const IDLE_MS = 2500;
/** Crossing the gap between two controls must not make them vanish. */
export const LEAVE_GRACE_MS = 300;

export interface AutoHide {
  readonly active: boolean;
  /** The pointer moved over the frame. */
  readonly wake: () => void;
  /** The pointer is resting on the controls; nothing may take them away. */
  readonly hold: () => void;
  /** The pointer left the frame. */
  readonly leave: () => void;
}

/**
 * Player chrome that shows itself on movement and gets out of the way on its own.
 * Whether it is *also* pinned — paused, or holding focus — belongs to the caller
 * and to CSS, so this only has to answer "has anything happened recently".
 */
export function useAutoHide(): AutoHide {
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const arm = useCallback((ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(false), ms);
  }, []);

  const wake = useCallback(() => { setActive(true); arm(IDLE_MS); }, [arm]);
  const leave = useCallback(() => arm(LEAVE_GRACE_MS), [arm]);

  // A pointer resting on the bar is not idleness: the controls must not be
  // pulled out from under the cursor that is aiming at them.
  const hold = useCallback(() => { clearTimeout(timer.current); setActive(true); }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return { active, wake, hold, leave };
}

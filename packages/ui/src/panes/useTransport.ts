import { useCallback, useEffect, useRef, useState } from 'react';

export const RATES = [0.75, 1, 1.25, 1.5, 2, 3] as const;

/** Tap distance at 1x. Scales with rate so a jump covers the same amount of narration. */
const SEEK_BASE_S = 5;
/** Held longer than this and the press is a hold, not a tap. */
const HOLD_MS = 180;
/** Audio cannot play backwards, so holding left rewinds by repeated seeks instead. */
const REWIND_TICK_MS = 100;
const REWIND_STEP_S = 0.8;
const MAX_RATE = 4;

/** Tap distance scales with rate, so a jump covers the same amount of narration at any speed. */
export function seekDistance(rate: number): number {
  return SEEK_BASE_S * rate;
}

/** Holding doubles the current rate rather than jumping to a fixed one, so it always does something. */
export function boostedRate(rate: number): number {
  return Math.min(MAX_RATE, rate * 2);
}

export function nextRate(rate: number): number {
  const at = RATES.indexOf(rate as (typeof RATES)[number]);
  return RATES[(at + 1) % RATES.length]!;
}

export interface Transport {
  readonly rate: number;
  readonly boosting: boolean;
  setRate: (rate: number) => void;
  cycleRate: () => void;
  toggle: () => void;
  seek: (deltaS: number) => void;
}

/**
 * Keyboard transport for the deck.
 *
 *   tap  ← / →   seek 5s, scaled by rate — at 2x a tap covers 10s
 *   hold →       play faster while held
 *   hold ←       rewind continuously (no negative playbackRate exists)
 *   space        play / pause
 *
 * Station changes (↑ / ↓) belong to the app, not here: they are not transport.
 */
export function useTransport(
  audio: React.RefObject<HTMLAudioElement | null>,
  enabled = true,
): Transport {
  const [rate, setRateState] = useState(1);
  const [boosting, setBoosting] = useState(false);

  // Refs, not state: the key handlers must see current values without re-binding
  const rateRef = useRef(1);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const rewindTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const held = useRef<'left' | 'right' | undefined>(undefined);
  /** Single source of truth for "a hold is in progress"; never infer it from playbackRate. */
  const holding = useRef(false);

  const setRate = useCallback((next: number) => {
    rateRef.current = next;
    setRateState(next);
    if (audio.current) audio.current.playbackRate = next;
  }, [audio]);

  const cycleRate = useCallback(() => setRate(nextRate(rateRef.current)), [setRate]);

  const seek = useCallback((deltaS: number) => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.min(el.duration || Infinity, Math.max(0, el.currentTime + deltaS));
  }, [audio]);

  const toggle = useCallback(() => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) void el.play(); else el.pause();
  }, [audio]);

  const endHold = useCallback(() => {
    clearTimeout(holdTimer.current);
    clearInterval(rewindTimer.current);
    holdTimer.current = undefined;
    rewindTimer.current = undefined;
    holding.current = false;
    held.current = undefined;
    if (audio.current) audio.current.playbackRate = rateRef.current;
    setBoosting(false);
  }, [audio]);

  useEffect(() => {
    if (!enabled) return;

    const onDown = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;

      e.preventDefault();
      // Auto-repeat fires keydown over and over; only the first press starts a hold
      if (e.repeat || held.current) return;

      const dir = e.key === 'ArrowRight' ? 'right' : 'left';
      held.current = dir;

      holdTimer.current = setTimeout(() => {
        holding.current = true;
        setBoosting(true);
        if (dir === 'right') {
          if (audio.current) {
            audio.current.playbackRate = boostedRate(rateRef.current);
          }
        } else {
          rewindTimer.current = setInterval(
            () => seek(-REWIND_STEP_S * rateRef.current),
            REWIND_TICK_MS,
          );
        }
      }, HOLD_MS);
    };

    const onUp = (e: KeyboardEvent): void => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const dir = held.current;
      const wasHold = holding.current;
      endHold();

      // Released before the hold threshold: it was a tap
      if (!wasHold && dir) {
        seek((dir === 'left' ? -1 : 1) * seekDistance(rateRef.current));
      }
    };

    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    // A hold that survives a blur would never end
    window.addEventListener('blur', endHold);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', endHold);
      endHold();
    };
  }, [enabled, seek, toggle, endHold, audio]);

  return { rate, boosting, setRate, cycleRate, toggle, seek };
}

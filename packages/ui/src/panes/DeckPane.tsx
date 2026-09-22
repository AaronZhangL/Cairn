import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { toCaptions } from '@cairn/core/pipeline/caption';
import type { NodeDeck, PathNode } from '@cairn/core/types';
import { SlideView } from '../slides/SlideView';
import { revealProgress } from '../slides/reveal';
import { RATES, useTransport } from './useTransport';

/**
 * Centre pane: the deck plays itself while the narration reads.
 * Audio time is the single source of truth — the visible slide and the caption
 * are both derived from it, so they can never drift apart.
 */
export function DeckPane({
  node, deck, audioSrc, stageTitle, onSelect, onEnded, build = 'pending',
}: {
  node: PathNode;
  deck: NodeDeck | undefined;
  /** Why there is no deck: still being built, or it never will be. */
  build?: 'pending' | 'failed';
  audioSrc: string;
  /** The path's own stage, shown in the slide's frame. Absent is fine. */
  stageTitle?: string;
  onSelect: (text: string) => void;
  onEnded: () => void;
}): ReactElement {
  const audio = useRef<HTMLAudioElement>(null);
  const [ms, setMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const transport = useTransport(audio, deck !== undefined);

  // Clause-level lines, derived from the sentence cues the deck already carries,
  // so a book generated before captions existed gets them without regenerating.
  const captions = useMemo(() => toCaptions(deck?.narration ?? []), [deck]);

  // Restart from the top whenever the station changes — and only then
  useEffect(() => {
    setMs(0);
    const el = audio.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().catch(() => setPlaying(false));
  }, [node.id]);

  // A new src resets playbackRate, so reapply it without touching the position
  useEffect(() => {
    if (audio.current) audio.current.playbackRate = transport.rate;
  }, [node.id, transport.rate]);

  if (!deck) {
    // Pending is the ordinary case now: the path lands whole and the stations
    // fill in behind the reader, so arriving early at one is expected.
    return (
      <main className="pane deck-pane">
        <div className="deck-empty">
          {build === 'failed' ? '这一站没能生成' : '这一站还在生成，稍等一下'}
        </div>
      </main>
    );
  }

  const slideIdx = lastIndexAtOrBefore(deck.slides.map((s) => s.atMs), ms);
  // Between captions there is no exact hit, so hold the last one that started
  const capIdx = lastIndexAtOrBefore(captions.map((c) => c.startMs), ms);
  const slide = deck.slides[slideIdx];
  const caption = captions[capIdx];

  // How far the voice has moved through this slide's own span. Layouts that
  // build use it to reveal in step; derived from audio time like everything
  // else on screen, so a scrub backwards folds the slide back up too.
  const progress = revealProgress(
    captions.map((c) => c.startMs),
    slide?.atMs ?? 0,
    deck.slides[slideIdx + 1]?.atMs ?? deck.durationMs,
    ms,
  );

  const seek = (to: number): void => {
    const el = audio.current;
    if (!el) return;
    el.currentTime = Math.max(0, to) / 1000;
    setMs(Math.max(0, to));
  };

  return (
    <main className="pane deck-pane">
      <div className="deck-head">
        <span className="deck-kicker">第 {node.idx + 1} 站</span>
        <span className="deck-title">{node.title}</span>
      </div>

      <div className="slide-stage-fit">
        {/* The caption sits inside the frame, the way it would in a video: the
            deck is what is being watched, and a band below it pulled the eye
            off the slide every time the line changed. */}
        <div className="slide-stage captioned">
          {slide && (
            <SlideView
              slide={slide}
              progress={progress}
              chrome={{
                stageTitle,
                stationNo: node.idx + 1,
                slideIdx,
                slideCount: deck.slides.length,
              }}
            />
          )}
          <div
            className="slide-caption"
            onMouseUp={() => {
              const picked = window.getSelection()?.toString().trim();
              if (picked) onSelect(picked);
            }}
          >
            {caption && <p key={capIdx}>{caption.text}</p>}
          </div>
        </div>
      </div>

      <div className="transport">
        <button type="button" className="play" onClick={transport.toggle}>
          {playing ? '❚❚' : '▶'}
        </button>

        <input
          className="scrub" type="range" min={0} max={deck.durationMs} value={ms}
          onChange={(e) => seek(Number(e.target.value))}
        />
        <span className="clock">{fmt(ms)} / {fmt(deck.durationMs)}</span>

        <div className="rate-wrap">
          {rateOpen && (
            <>
              {/* Click anywhere else to dismiss, without trapping focus */}
              <div className="rate-scrim" onClick={() => setRateOpen(false)} />
              <div className="rate-menu" role="menu">
                {RATES.map((r) => (
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={r === transport.rate}
                    key={r}
                    className={r === transport.rate ? 'rate-item on' : 'rate-item'}
                    onClick={() => { transport.setRate(r); setRateOpen(false); }}
                  >
                    {r}×
                  </button>
                ))}
              </div>
            </>
          )}
          <button
            type="button"
            className={transport.boosting ? 'rate boosting' : 'rate'}
            aria-haspopup="menu"
            aria-expanded={rateOpen}
            onClick={() => setRateOpen((v) => !v)}
            title="选择倍速 · 长按 → 临时加速"
          >
            {transport.boosting ? '▶▶' : `${transport.rate}×`}
          </button>
        </div>

        <span className="page">{slideIdx + 1} / {deck.slides.length}</span>
      </div>

      <audio
        ref={audio}
        src={audioSrc}
        onTimeUpdate={(e) => setMs(Math.round(e.currentTarget.currentTime * 1000))}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
      />
    </main>
  );
}

/** The slide in force at time `ms` — the last one whose atMs has passed. */
function lastIndexAtOrBefore(marks: readonly number[], ms: number): number {
  let found = 0;
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i]! <= ms) found = i;
    else break;
  }
  return found;
}

function fmt(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

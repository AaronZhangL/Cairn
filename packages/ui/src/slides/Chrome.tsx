import type { ReactElement } from 'react';

export interface SlideChrome {
  /** The path's own stage, e.g. 建立模型 — not the book's part or chapter. */
  readonly stageTitle?: string;
  /** 1-based station number, as the left pane shows it. */
  readonly stationNo: number;
  /** 0-based index of the visible slide, and how many the station has. */
  readonly slideIdx: number;
  readonly slideCount: number;
}

/**
 * The frame around every slide: where you are in the path, and where you are in
 * this station's deck.
 *
 * Without it the deck is a sequence of unmarked cards — nothing on screen says
 * whether a page is the second of three or the last, and the transport bar
 * below the stage is the wrong place to look while watching. It sits above the
 * slide and takes no pointer events so selecting slide text still works.
 */
export function Chrome({ stageTitle, stationNo, slideIdx, slideCount }: SlideChrome): ReactElement {
  return (
    <div className="s-chrome" aria-hidden="true">
      <div className="s-stationtag">
        {stageTitle ? `${stageTitle} · ` : ''}第 {stationNo} 站
      </div>
      <div className="s-dots">
        {Array.from({ length: slideCount }, (_, i) => (
          <i key={i} className={i === slideIdx ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

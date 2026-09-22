import type { ReactElement } from 'react';
import { SlideView } from './SlideView';
import { GAUNTLET } from './__fixtures__/gauntlet';
import './gauntlet.css';

/**
 * The layout gauntlet: every slide in `__fixtures__/gauntlet.ts`, rendered.
 *
 * Deliberately not a test. Overflow is a property of real layout and nothing in
 * the test setup lays anything out, so this is checked by eye — resize the
 * window and look for text leaving its box, text under a graphic, or a slide
 * taller than its frame.
 *
 * Reached at `?gauntlet` in `bun run dev`, which needs neither codex nor
 * edge-tts.
 */
export function Gauntlet(): ReactElement {
  return (
    <div className="gauntlet">
      <h1>版式极端值样板</h1>
      <p className="gauntlet-hint">
        拖动窗口宽度，逐张检查：有没有文字越出画面、压在图形上，或把画面撑高。
      </p>
      {GAUNTLET.map(({ what, slide }, i) => (
        <section key={what}>
          <h2>{i + 1}. {what}</h2>
          <div className="slide-stage">
            <SlideView slide={slide} chrome={{ stageTitle: '极端值', stationNo: i + 1, slideIdx: i, slideCount: GAUNTLET.length }} />
          </div>
        </section>
      ))}
    </div>
  );
}

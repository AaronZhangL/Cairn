import type { ReactElement } from 'react';
import type { Slide } from '@cairn/core/types';
import { magnitudes } from '../magnitude';

type Props = Extract<Slide, { layout: 'number' }>;

/** Below this a bar is a hairline and reads as a rendering glitch, not a value. */
const MIN_WIDTH = 1.5;

/**
 * Figures as bars rather than as three large numerals side by side.
 *
 * "1" next to "110" only says something once the eye can see the ratio, and the
 * numerals alone do not show it — they are the same size, so the page reads as
 * three equal facts. A zero gets a marked-empty track instead of a bar, which
 * is the whole point of quoting a zero.
 *
 * When the values are not comparable (a percentage beside a count, a figure
 * with no digits) there are no bars at all. A bar drawn from a guess would
 * assert a ratio the source never claimed.
 */
export function NumberSlide({ heading, items, note }: Props): ReactElement {
  const fractions = magnitudes(items.map((i) => i.value));

  return (
    <div className="s">
      {heading && <h2 className="s-h2">{heading}</h2>}
      <div className={fractions ? 's-bars' : 's-bars plain'}>
        {items.map((item, i) => {
          const fraction = fractions?.[i];
          return (
            <div className="s-bar-row" key={item.label}>
              <div className="s-bar-line">
                <div className="s-bar-v">{item.value}</div>
                {fraction !== undefined && (
                  <div className="s-bar-track">
                    <div
                      className={fraction === 0 ? 's-bar-fill zero' : 's-bar-fill'}
                      style={{ width: `${Math.max(fraction * 100, MIN_WIDTH)}%` }}
                    />
                  </div>
                )}
              </div>
              <div className="s-bar-l">{item.label}</div>
            </div>
          );
        })}
      </div>
      {note && <p className="s-note">{note}</p>}
    </div>
  );
}

import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { magnitudes } from '../magnitude';

type Props = Extract<Slide, { layout: 'number' }> & { readonly shown: number };

/** Below this a bar is a hairline and reads as a rendering glitch, not a value. */
const MIN_WIDTH = 1.5;

/**
 * Figures as bars, and no bars at all when the values are not comparable — a bar
 * drawn from a guess asserts a ratio the book never claimed. See DESIGN.md.
 */
export function NumberSlide({ heading, items, note, shown }: Props): ReactElement {
  const fractions = magnitudes(items.map((i) => i.value));
  const valueFit = fitAll(items.map((i) => i.value), 'value');
  const labelFit = fitAll(items.map((i) => i.label), 'label');

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <div className={fractions ? 's-bars' : 's-bars plain'}>
        {items.map((item, i) => {
          const fraction = fractions?.[i];
          return (
            <div className={`s-bar-row ${i < shown ? 'in' : 'out'}`} key={item.label}>
              <div className="s-bar-v" data-fit={valueFit}>{item.value}</div>
              {fraction !== undefined && (
                <div className="s-bar-track">
                  <div
                    className={fraction === 0 ? 's-bar-fill zero' : 's-bar-fill'}
                    style={{ width: `${Math.max(fraction * 100, MIN_WIDTH)}%` }}
                  />
                </div>
              )}
              <div className="s-bar-l" data-fit={labelFit}>{item.label}</div>
            </div>
          );
        })}
      </div>
      {note && <p className="s-note" data-fit={fitOf(note, 'note')}>{note}</p>}
    </div>
  );
}

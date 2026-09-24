import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { Aside } from './Aside';

type Props = Extract<Slide, { layout: 'quadrant' }> & { readonly shown: number };

/**
 * Two dimensions crossed into four named types. The axes carry their ends as
 * words, never as arrows or rotated text, and the cells are not coloured apart:
 * position already says which is which.
 */
export function Quadrant({ heading, x, y, cells, focus, aside, shown }: Props): ReactElement {
  const poleFit = fitAll([x.low, x.high, y.low, y.high], 'quadrantPole');
  const nameFit = fitAll(cells.map((c) => c.name), 'quadrantName');
  const textFit = fitAll(cells.map((c) => c.text), 'quadrantText');

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <div className="s-qd">
        <div className="s-qd-y">
          <span className="s-qd-pole" data-fit={poleFit}>{y.high}</span>
          <span className="s-qd-pole" data-fit={poleFit}>{y.low}</span>
        </div>
        <ol className="s-qd-grid">
          {cells.map((cell, i) => (
            <li key={cell.name} className={`s-qd-cell ${i < shown ? 'in' : 'out'}${i === focus ? ' hl' : ''}`}>
              <span className="s-qd-name" data-fit={nameFit}>{cell.name}</span>
              <span className="s-qd-text" data-fit={textFit}>{cell.text}</span>
            </li>
          ))}
        </ol>
        <div className="s-qd-x">
          <span className="s-qd-pole" data-fit={poleFit}>{x.low}</span>
          <span className="s-qd-pole" data-fit={poleFit}>{x.high}</span>
        </div>
      </div>
      <Aside text={aside} shown={shown >= cells.length} />
    </div>
  );
}

import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { Aside } from './Aside';

type Props = Extract<Slide, { layout: 'pyramid' }> & { readonly shown: number };

/** Level `i` of `n` as a trapezoid: its top edge is the bottom edge of the level above. */
function band(i: number, n: number): string {
  const top = (50 * i) / n;
  const bottom = (50 * (i + 1)) / n;
  return `polygon(${50 - top}% 0, ${50 + top}% 0, ${50 + bottom}% 100%, ${50 - bottom}% 100%)`;
}

/**
 * A ranking the book states, apex first. The labels sit beside the shape, not in
 * it: the apex is too narrow to hold a word, and a label squeezed to fit it
 * would read as the least important instead of the most.
 */
export function Pyramid({ heading, levels, focus, aside, shown }: Props): ReactElement {
  const labelFit = fitAll(levels, 'pyramidLevel');

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <ol className="s-py">
        {levels.map((level, i) => (
          <li key={level} className={`${i < shown ? 'in' : 'out'}${i === focus ? ' hl' : ''}`}>
            <span className="s-py-band" aria-hidden="true" style={{ clipPath: band(i, levels.length) }} />
            <span className="s-py-label" data-fit={labelFit}>{level}</span>
          </li>
        ))}
      </ol>
      <Aside text={aside} shown={shown >= levels.length} />
    </div>
  );
}

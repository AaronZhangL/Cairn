import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';

type Props = Extract<Slide, { layout: 'matrix' }> & { readonly shown: number };

/** The same question asked of both sides: here the pairing is the layout. */
export function Matrix({ heading, left, right, rows, shown }: Props): ReactElement {
  const headFit = fitAll([left, right], 'matrixHead');
  const aspectFit = fitAll(rows.map((r) => r.aspect), 'matrixAspect');
  const cellFit = fitAll(rows.flatMap((r) => [r.left, r.right]), 'matrixCell');

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <div className="s-mx">
        <div className="s-mx-row s-mx-heads">
          <span />
          <span className="s-mx-head" data-fit={headFit}>{left}</span>
          <span className="s-mx-head hl" data-fit={headFit}>{right}</span>
        </div>
        {rows.map((row, i) => (
          <div key={row.aspect} className={`s-mx-row ${i < shown ? 'in' : 'out'}`}>
            <span className="s-mx-aspect" data-fit={aspectFit}>{row.aspect}</span>
            <span className="s-mx-cell" data-fit={cellFit}>{row.left}</span>
            <span className="s-mx-cell hl" data-fit={cellFit}>{row.right}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';

type Props = Extract<Slide, { layout: 'points' }> & { readonly shown: number };

/**
 * Up to three claims, arriving with the narration. Sized together: a long claim
 * set smaller would read as the least important, which is not what length means.
 */
export function Points({ heading, points, shown }: Props): ReactElement {

  return (
    <div className="s">
      <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>
      <ol className="s-points" data-fit={fitAll(points, 'point')}>
        {points.map((text, i) => (
          <li key={text} className={i < shown ? 'in' : 'out'}>
            <span className="s-dot">{String(i + 1).padStart(2, '0')}</span>
            <span className="s-ptext">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

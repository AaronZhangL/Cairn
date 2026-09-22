import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { revealCount } from '../reveal';

type Props = Extract<Slide, { layout: 'points' }> & { readonly progress: number };

/**
 * Up to three claims, appearing one at a time with the narration.
 *
 * No icons here on purpose. The numbered marks already carry the rhythm, and a
 * glyph per line would compete with the words for the same job.
 *
 * The three claims are sized together: one long claim set smaller than its
 * neighbours would read as the least important, which is not what length means.
 */
export function Points({ heading, points, progress }: Props): ReactElement {
  const shown = revealCount(points.length, progress);

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

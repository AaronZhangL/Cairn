import type { ReactElement } from 'react';
import type { Slide } from '@cairn/core/types';
import { revealCount } from '../reveal';

type Props = Extract<Slide, { layout: 'points' }> & { readonly progress: number };

/**
 * Up to three claims, appearing one at a time with the narration.
 *
 * No icons here on purpose. The numbered marks already carry the rhythm, and a
 * glyph per line would compete with the words for the same job.
 */
export function Points({ heading, points, progress }: Props): ReactElement {
  const shown = revealCount(points.length, progress);

  return (
    <div className="s">
      <h2 className="s-h2">{heading}</h2>
      <ol className="s-points">
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

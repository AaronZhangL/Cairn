import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { revealCount } from '../reveal';

type Props = Extract<Slide, { layout: 'flow' }> & { readonly progress: number };

/**
 * A chain: derivation, causal link, or sequence of steps.
 *
 * Laid out as a column of connected nodes rather than a wrapped row of pills.
 * A wrapped row breaks the chain at an arbitrary point — whichever step happens
 * to hit the right edge — and the break reads as a meaningful gap when it is
 * only a line wrap. A column has one direction and never wraps, and the steps
 * arrive in order with the narration, which is what a chain is for.
 *
 * That argument is about the chain, not about the text inside a node, and
 * nothing used to keep a long step from wrapping the node itself into two
 * lines. `data-fit` does: the whole chain steps down a size together so the
 * nodes stay single-line and evenly weighted.
 */
export function Flow({ heading, steps, progress }: Props): ReactElement {
  const shown = revealCount(steps.length, progress);

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <ol className="s-flow" data-fit={fitAll(steps, 'step')}>
        {steps.map((step, i) => (
          <li key={step} className={i < shown ? 'in' : 'out'}>
            <span className="s-node">
              <i className="s-node-i" aria-hidden="true" />
              <span className="s-node-t">{step}</span>
            </span>
            {i < steps.length - 1 && <span className="s-link" aria-hidden="true" />}
          </li>
        ))}
      </ol>
    </div>
  );
}

import type { ReactElement } from 'react';
import type { ComparePane, Slide } from '@cairn/core/types';
import { Icon } from '../Icon';

type Props = Extract<Slide, { layout: 'compare' }> & { readonly progress: number };

/**
 * A against B.
 *
 * The right pane is the emphasised one: a comparison on a slide almost always
 * exists to land the second side, and two identically weighted panes make the
 * reader do that work themselves. The second pane also arrives a beat later,
 * so the contrast is stated rather than merely laid out.
 *
 * Each side may claim one glyph — here an icon does real work, because it
 * labels which pane is which at a glance across the whole slide.
 */
export function Compare({ heading, left, right, progress }: Props): ReactElement {
  return (
    <div className="s">
      {heading && <h2 className="s-h2">{heading}</h2>}
      <div className="s-compare">
        <Pane pane={left} className="s-pane in" />
        <div className="s-vs" aria-hidden="true" />
        <Pane pane={right} className={progress > 0.34 ? 's-pane hl in' : 's-pane hl out'} />
      </div>
    </div>
  );
}

function Pane({ pane, className }: { pane: ComparePane; className: string }): ReactElement {
  return (
    <div className={className}>
      <div className="s-pane-h">
        {pane.icon && <span className="s-pane-i"><Icon name={pane.icon} /></span>}
        <span className="s-pane-t">{pane.title}</span>
      </div>
      <ul>
        {pane.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </div>
  );
}

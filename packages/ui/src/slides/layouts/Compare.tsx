import type { ReactElement } from 'react';
import { type FitStep, fitAll, fitOf } from '@cairn/core/fit';
import type { ComparePane, Slide } from '@cairn/core/types';
import { Icon } from '../Icon';

type Props = Extract<Slide, { layout: 'compare' }> & { readonly showRight: boolean };

/**
 * A against B. Both panes take one size computed across both — sizing them apart
 * would say one side matters more when all that differs is word length.
 */
export function Compare({ heading, left, right, showRight }: Props): ReactElement {
  const titleFit = fitAll([left.title, right.title], 'paneTitle');
  const pointFit = fitAll([...left.points, ...right.points], 'panePoint');

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <div className="s-compare">
        <Pane pane={left} className="s-pane in" titleFit={titleFit} pointFit={pointFit} />
        <div className="s-vs" aria-hidden="true" />
        <Pane
          pane={right}
          className={showRight ? 's-pane hl in' : 's-pane hl out'}
          titleFit={titleFit}
          pointFit={pointFit}
        />
      </div>
    </div>
  );
}

function Pane({ pane, className, titleFit, pointFit }: {
  pane: ComparePane;
  className: string;
  titleFit: FitStep;
  pointFit: FitStep;
}): ReactElement {
  return (
    <div className={className}>
      <div className="s-pane-h">
        {pane.icon && <span className="s-pane-i"><Icon name={pane.icon} /></span>}
        <span className="s-pane-t" data-fit={titleFit}>{pane.title}</span>
      </div>
      <ul data-fit={pointFit}>
        {pane.points.map((p) => <li key={p}>{p}</li>)}
      </ul>
    </div>
  );
}

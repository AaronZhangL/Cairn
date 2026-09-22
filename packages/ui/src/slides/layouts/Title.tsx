import type { ReactElement } from 'react';
import { fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { Icon } from '../Icon';

type Props = Extract<Slide, { layout: 'title' }> & { readonly stationNo?: number };

/**
 * The station's opening card. It does one job the other layouts cannot: make
 * this station recognisable when the reader scrolls back to it later. The
 * oversized station number and the pictogram are both for that — a wall of
 * identically-styled title cards is unnavigable.
 */
export function Title({ kicker, title, subtitle, icon, stationNo }: Props): ReactElement {
  return (
    <>
      {stationNo !== undefined && (
        <div className="s-ghost" aria-hidden="true">{String(stationNo).padStart(2, '0')}</div>
      )}
      {icon && <div className="s-hero" aria-hidden="true"><Icon name={icon} /></div>}
      <div className="s s-title">
        {kicker && <span className="s-kicker" data-fit={fitOf(kicker, 'kicker')}>{kicker}</span>}
        <h1 className="s-h1" data-fit={fitOf(title, 'title')}>{title}</h1>
        <div className="s-rule" />
        {subtitle && <p className="s-sub" data-fit={fitOf(subtitle, 'subtitle')}>{subtitle}</p>}
      </div>
    </>
  );
}

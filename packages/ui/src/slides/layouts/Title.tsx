import type { ReactElement } from 'react';
import { fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { Icon } from '../Icon';

type Props = Extract<Slide, { layout: 'title' }> & { readonly stationNo?: number };

/** The station's opening card: named, numbered, and recognisable on the way back. */
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

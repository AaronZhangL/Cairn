import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { Aside } from './Aside';

type Props = Extract<Slide, { layout: 'relation' }> & { readonly shown: number };

/** Cause and effect as stated: the relation sits on the arrow, not in a sentence. */
export function Relation({ heading, links, focus, aside, shown }: Props): ReactElement {
  const nodeFit = fitAll(links.flatMap((l) => [l.from, l.to]), 'relationNode');
  const howFit = fitAll(links.map((l) => l.how), 'relationHow');

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <ol className="s-rel">
        {links.map((link, i) => (
          <li key={`${link.from}${link.how}${link.to}`} className={i < shown ? 'in' : 'out'}>
            <span className="s-rel-node" data-fit={nodeFit}>{link.from}</span>
            <span className="s-rel-wire" aria-hidden="true" />
            <span className="s-rel-how" data-fit={howFit}>{link.how}</span>
            <span className="s-rel-wire arrow" aria-hidden="true" />
            <span className={i === focus ? 's-rel-node hl' : 's-rel-node'} data-fit={nodeFit}>{link.to}</span>
          </li>
        ))}
      </ol>
      <Aside text={aside} shown={shown >= links.length} />
    </div>
  );
}

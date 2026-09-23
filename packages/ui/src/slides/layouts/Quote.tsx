import type { ReactElement } from 'react';
import { fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { useT } from '../../settings/SettingsProvider';

type Props = Extract<Slide, { layout: 'quote' }>;

/**
 * The book's own words. A missing `source` is shown, not hidden: a quote nobody
 * could locate is exactly the one worth doubting. See DESIGN.md.
 */
export function Quote({ text, cite, source }: Props): ReactElement {
  const t = useT();
  return (
    <div className="s s-quote-wrap">
      <div className="s-qmark" aria-hidden="true">&ldquo;</div>
      <blockquote className="s-quote" data-fit={fitOf(text, 'quote')}>{text}</blockquote>
      {cite && <div className="s-cite" data-fit={fitOf(cite, 'cite')}>{cite}</div>}
      <div className={`s-source${source ? '' : ' unsourced'}`}>
        {source ? t.quote.source(source.chapter + 1) : t.quote.noSource}
      </div>
    </div>
  );
}

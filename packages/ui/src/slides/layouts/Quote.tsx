import type { ReactElement } from 'react';
import { fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';

type Props = Extract<Slide, { layout: 'quote' }>;

/**
 * The book's own words.
 *
 * The reader has not read this book, so the one thing this layout must do is
 * make "this is verbatim" visible without saying it. Styling it like the other
 * layouts would leave the claim indistinguishable from the model's paraphrase,
 * which is the failure the sourceChapters invariant exists to prevent.
 *
 * `source` is the stronger form of the same guarantee: the line was found in a
 * chapter excerpt, and the slide says which. Its absence is deliberately
 * visible — a quote nobody could locate is exactly the one worth doubting.
 *
 * A quote cannot be shortened to fit — it is verbatim or it is nothing — so
 * this is the layout that most needs the type to give way instead.
 */
export function Quote({ text, cite, source }: Props): ReactElement {
  return (
    <div className="s s-quote-wrap">
      <div className="s-qmark" aria-hidden="true">&ldquo;</div>
      <blockquote className="s-quote" data-fit={fitOf(text, 'quote')}>{text}</blockquote>
      {cite && <div className="s-cite" data-fit={fitOf(cite, 'cite')}>{cite}</div>}
      <div className={`s-source${source ? '' : ' unsourced'}`}>
        {source ? `原文 · 第 ${source.chapter + 1} 章` : '未在原文中找到出处'}
      </div>
    </div>
  );
}

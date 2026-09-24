import type { ReactElement } from 'react';
import { fitOf } from '@cairn/core/fit';

/** The book's own words in the margin, arriving once the figure beside it is complete. */
export function Aside({ text, shown }: { text?: string; shown: boolean }): ReactElement | null {
  if (!text) return null;
  return (
    <p className={`s-aside ${shown ? 'in' : 'out'}`} data-fit={fitOf(text, 'aside')}>{text}</p>
  );
}

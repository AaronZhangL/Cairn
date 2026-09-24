import type { CSSProperties, ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { Aside } from './Aside';

type Props = Extract<Slide, { layout: 'overlap' }> & { readonly shown: number };

interface Placement {
  /** Circle centre, in cqw from the figure's centre. */
  readonly cx: number;
  readonly cy: number;
  /** The label sits outside its circle, on this side, so it never crosses a stroke. */
  readonly side: 'left' | 'right';
  /** Label height from the centre; the top circle's label rises clear of its neighbour. */
  readonly labelY: number;
}

/** Diameters and centres in cqw, sized so the figure fits the 26cqw-tall `.s-ov`. */
const LAYOUTS: Readonly<Record<2 | 3, { readonly d: number; readonly at: readonly Placement[] }>> = {
  2: {
    d: 26,
    at: [{ cx: -9, cy: 0, side: 'left', labelY: 0 }, { cx: 9, cy: 0, side: 'right', labelY: 0 }],
  },
  3: {
    d: 16,
    at: [
      { cx: 0, cy: -3.7, side: 'right', labelY: -8 },
      { cx: -4.8, cy: 4.6, side: 'left', labelY: 4.6 },
      { cx: 4.8, cy: 4.6, side: 'right', labelY: 4.6 },
    ],
  },
};

const circle = (p: Placement, d: number): CSSProperties => ({
  width: `${d}cqw`, height: `${d}cqw`,
  left: `calc(50% + ${p.cx - d / 2}cqw)`, top: `calc(50% + ${p.cy - d / 2}cqw)`,
});

/** Anchored at the circle's outer edge and growing away from it. */
const label = (p: Placement, d: number): CSSProperties => {
  const edge = p.side === 'left' ? p.cx - d / 2 - 1.5 : p.cx + d / 2 + 1.5;
  return p.side === 'left'
    ? { right: `calc(50% - ${edge}cqw)`, top: `calc(50% + ${p.labelY}cqw)`, textAlign: 'right' }
    : { left: `calc(50% + ${edge}cqw)`, top: `calc(50% + ${p.labelY}cqw)` };
};

/**
 * Where two or three things meet, and what the book calls that place. The meeting
 * place is the one accent: it is the claim, and the sets are only its terms.
 */
export function Overlap({ heading, sets, meet, aside, shown }: Props): ReactElement {
  const { d, at } = LAYOUTS[sets.length === 3 ? 3 : 2];
  const setFit = fitAll(sets, 'overlapSet');

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <div className="s-ov">
        {sets.map((set, i) => {
          const p = at[i]!;
          const state = i < shown ? 'in' : 'out';
          return (
            <div key={set} className={`s-ov-item ${state}`}>
              <span className="s-ov-circle" aria-hidden="true" style={circle(p, d)} />
              <span className="s-ov-set" data-fit={setFit} style={label(p, d)}>{set}</span>
            </div>
          );
        })}
        <span
          className={`s-ov-meet ${shown > sets.length ? 'in' : 'out'}`}
          data-fit={fitOf(meet, 'overlapMeet')}
        >
          {meet}
        </span>
      </div>
      <Aside text={aside} shown={shown > sets.length} />
    </div>
  );
}

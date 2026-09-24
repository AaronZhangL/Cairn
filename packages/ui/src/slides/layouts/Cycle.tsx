import type { ReactElement } from 'react';
import { fitAll, fitOf } from '@cairn/core/fit';
import type { Slide } from '@cairn/core/types';
import { Aside } from './Aside';

type Props = Extract<Slide, { layout: 'cycle' }> & { readonly shown: number };

/** Ring radii in cqw. `.s-cy-ring` in slide.css draws the same ellipse; move them together. */
const RX = 30;
const RY = 10;

const at = (angle: number): { left: string; top: string } => ({
  left: `calc(50% + ${(RX * Math.cos(angle)).toFixed(2)}cqw)`,
  top: `calc(50% + ${(RY * Math.sin(angle)).toFixed(2)}cqw)`,
});

/** Clockwise from the top, so the loop reads the way a clock does. */
const angleOf = (i: number, n: number): number => -Math.PI / 2 + (2 * Math.PI * i) / n;

/**
 * A loop the book closes. Unlike `flow` there is no last step: the arrow out of
 * the final node lands on the first, and that return is the claim.
 */
export function Cycle({ heading, steps, focus, aside, shown }: Props): ReactElement {
  const n = steps.length;

  return (
    <div className="s">
      {heading && <h2 className="s-h2" data-fit={fitOf(heading, 'heading')}>{heading}</h2>}
      <div className="s-cy">
        <div className="s-cy-ring" aria-hidden="true" />
        {steps.map((_, i) => {
          const mid = (angleOf(i, n) + angleOf(i + 1, n)) / 2;
          const tangent = Math.atan2(RY * Math.cos(mid), -RX * Math.sin(mid));
          return (
            <i
              key={`arrow-${i}`}
              aria-hidden="true"
              className={`s-cy-arrow ${Math.min(i + 2, n) <= shown ? 'in' : 'out'}`}
              style={{ ...at(mid), transform: `translate(-50%, -50%) rotate(${tangent}rad)` }}
            />
          );
        })}
        <ol data-fit={fitAll(steps, 'cycleStep')}>
          {steps.map((step, i) => (
            <li
              key={step}
              className={`s-cy-node ${i < shown ? 'in' : 'out'}${i === focus ? ' hl' : ''}`}
              style={at(angleOf(i, n))}
            >
              {step}
            </li>
          ))}
        </ol>
      </div>
      <Aside text={aside} shown={shown >= n} />
    </div>
  );
}

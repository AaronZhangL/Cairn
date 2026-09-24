import { type ReactElement, type RefObject, useEffect, useRef, useState } from 'react';
import type { Slide } from '@cairn/core/types';
import { type Box, type Fault, faults } from './faults';
import { SlideView } from './SlideView';
import { GAUNTLET } from './__fixtures__/gauntlet';
import './gauntlet.css';

/**
 * Every layout at its worst, rendered. Reached at `?gauntlet` in `bun run dev`.
 * Deliberately not a test: overflow is a property of real layout, and nothing in
 * the test setup lays anything out. What can be measured here is measured, and
 * listed under the slide; the rest is still for the eye.
 */
export function Gauntlet(): ReactElement {
  const [counts, setCounts] = useState<Readonly<Record<number, number>>>({});
  const flagged = Object.values(counts).filter((n) => n > 0).length;

  return (
    <div className="gauntlet" data-faults={flagged}>
      <h1>版式极端值样板</h1>
      <p className="gauntlet-hint">
        拖动窗口宽度，逐张检查：有没有文字越出画面、压在图形上，或把画面撑高。
        能量出来的越界与文字重叠会列在每张下面——当前 {flagged} 张有问题。
      </p>
      {GAUNTLET.map(({ what, slide }, i) => (
        <GauntletSlide
          key={what}
          what={what}
          slide={slide}
          index={i}
          onFaults={(n) => setCounts((prev) => (prev[i] === n ? prev : { ...prev, [i]: n }))}
        />
      ))}
    </div>
  );
}

function GauntletSlide({ what, slide, index, onFaults }: {
  what: string;
  slide: Slide;
  index: number;
  onFaults: (count: number) => void;
}): ReactElement {
  const stage = useRef<HTMLDivElement>(null);
  const found = useMeasuredFaults(stage);
  useEffect(() => onFaults(found.length), [found.length, onFaults]);

  return (
    <section data-faults={found.length}>
      <h2>{index + 1}. {what}</h2>
      {/* `captioned` as the player draws it: the band is reserved whether or not a line is showing. */}
      <div className="slide-stage captioned" ref={stage}>
        <SlideView slide={slide} chrome={{ stageTitle: '极端值', stationNo: index + 1, slideIdx: index, slideCount: GAUNTLET.length }} />
      </div>
      {found.length > 0 && (
        <ul className="gauntlet-faults">
          {found.map((f) => (
            <li key={f.kind === 'overlap' ? `${f.label}|${f.other}` : f.label}>
              {f.kind === 'outside' ? `越出版心：${f.label}` : `文字重叠：${f.label} × ${f.other}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Re-measured after fonts load and on every resize, since both move the text. */
function useMeasuredFaults(stage: RefObject<HTMLDivElement | null>): readonly Fault[] {
  const [found, setFound] = useState<readonly Fault[]>([]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const measure = (): void => {
      const body = el.querySelector<HTMLElement>('.s');
      if (body) setFound(faults(contentBox(body), textBoxes(body)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, [stage]);

  return found;
}

function contentBox(el: HTMLElement): Box {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return {
    left: rect.left + parseFloat(style.paddingLeft),
    top: rect.top + parseFloat(style.paddingTop),
    right: rect.right - parseFloat(style.paddingRight),
    bottom: rect.bottom - parseFloat(style.paddingBottom),
  };
}

/** Elements that hold words themselves. Decoration is `aria-hidden` and may bleed on purpose. */
function textBoxes(root: HTMLElement): { label: string; box: Box }[] {
  return Array.from(root.querySelectorAll<HTMLElement>('*'))
    .filter((el) => !el.closest('[aria-hidden="true"]'))
    .filter((el) => Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim()))
    .map((el) => ({
      label: `.${el.classList[0] ?? el.tagName.toLowerCase()}「${(el.textContent ?? '').trim().slice(0, 10)}」`,
      box: el.getBoundingClientRect(),
    }));
}

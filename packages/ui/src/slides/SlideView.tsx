import type { ReactElement } from 'react';
import type { Slide } from '@cairn/core/types';
import { Chrome, type SlideChrome } from './Chrome';
import { Compare } from './layouts/Compare';
import { Title } from './layouts/Title';
import { Flow } from './layouts/Flow';
import { Matrix } from './layouts/Matrix';
import { NumberSlide } from './layouts/NumberSlide';
import { Points } from './layouts/Points';
import { Quote } from './layouts/Quote';
import { Relation } from './layouts/Relation';
import { Timeline } from './layouts/Timeline';
import { type Cue, type Phrase, revealCount, revealShown } from './reveal';
import './slide.css';

/** Where this slide sits on the narration, so items can arrive as they are spoken. */
export interface RevealWindow {
  readonly cues: readonly Cue[];
  readonly spanStartMs: number;
  readonly spanEndMs: number;
  readonly ms: number;
}

/**
 * Renders one slide. Every layout is type, stroked shapes and glyphs from the
 * local set — no images, no generation. Without a `reveal` window it falls back
 * to `progress`, which defaults to a finished slide for stills and tests.
 */
export function SlideView({
  slide, chrome, progress = 1, reveal,
}: {
  slide: Slide;
  chrome?: SlideChrome;
  progress?: number;
  reveal?: RevealWindow;
}): ReactElement | null {
  const shownOf = (items: readonly Phrase[]): number => (
    reveal
      ? revealShown(items, reveal.cues, reveal.spanStartMs, reveal.spanEndMs, reveal.ms)
      : revealCount(items.length, progress)
  );

  return (
    <>
      {chrome && <Chrome {...chrome} />}
      {body(slide, shownOf, chrome?.stationNo)}
    </>
  );
}

/**
 * The union is exhaustive; an unknown layout is a programming error, not a
 * runtime case to paper over, so it renders nothing rather than a fallback.
 */
function body(
  slide: Slide,
  shownOf: (items: readonly Phrase[]) => number,
  stationNo?: number,
): ReactElement | null {
  switch (slide.layout) {
    case 'title':
      return <Title {...slide} stationNo={stationNo} />;
    case 'points':
      return <Points {...slide} shown={shownOf(slide.points)} />;
    case 'number':
      return (
        <NumberSlide {...slide} shown={shownOf(slide.items.map((i) => [i.label, i.value]))} />
      );
    case 'quote':
      return <Quote {...slide} />;
    case 'compare':
      return (
        <Compare
          {...slide}
          showRight={shownOf([
            [slide.left.title, ...slide.left.points],
            [slide.right.title, ...slide.right.points],
          ]) > 1}
        />
      );
    case 'flow':
      return <Flow {...slide} shown={shownOf(slide.steps)} />;
    case 'timeline':
      return <Timeline {...slide} shown={shownOf(slide.items.map((i) => [i.text, i.mark]))} />;
    case 'matrix':
      return (
        <Matrix {...slide} shown={shownOf(slide.rows.map((r) => [r.aspect, r.left, r.right]))} />
      );
    case 'relation':
      return (
        <Relation {...slide} shown={shownOf(slide.links.map((l) => [l.from, l.to, l.how]))} />
      );
  }
}

export type { SlideChrome };

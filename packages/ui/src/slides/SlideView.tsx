import type { ReactElement } from 'react';
import type { Slide } from '@cairn/core/types';
import { Chrome, type SlideChrome } from './Chrome';
import { Compare } from './layouts/Compare';
import { Flow } from './layouts/Flow';
import { NumberSlide } from './layouts/NumberSlide';
import { Points } from './layouts/Points';
import { Quote } from './layouts/Quote';
import { Title } from './layouts/Title';
import './slide.css';

/**
 * Renders one slide. Every layout is type, stroked shapes and glyphs from the
 * local set — no images, no generation.
 *
 * `progress` is how far the narration has moved through this slide's own span,
 * in [0, 1]; layouts that build use it to reveal in step with the voice. It
 * defaults to 1 so a static render — a test, a still, the text view — shows the
 * finished slide rather than its first beat.
 *
 * The union is exhaustive; an unknown layout is a programming error, not a
 * runtime case to paper over, so it renders nothing rather than a fallback that
 * would hide the bug.
 */
export function SlideView({
  slide, chrome, progress = 1,
}: {
  slide: Slide;
  chrome?: SlideChrome;
  progress?: number;
}): ReactElement | null {
  return (
    <>
      {chrome && <Chrome {...chrome} />}
      {body(slide, progress, chrome?.stationNo)}
    </>
  );
}

function body(slide: Slide, progress: number, stationNo?: number): ReactElement | null {
  switch (slide.layout) {
    case 'title':
      return <Title {...slide} stationNo={stationNo} />;
    case 'points':
      return <Points {...slide} progress={progress} />;
    case 'number':
      return <NumberSlide {...slide} />;
    case 'quote':
      return <Quote {...slide} />;
    case 'compare':
      return <Compare {...slide} progress={progress} />;
    case 'flow':
      return <Flow {...slide} progress={progress} />;
  }
}

export type { SlideChrome };

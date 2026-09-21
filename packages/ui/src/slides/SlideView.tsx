import type { ReactElement } from 'react';
import type { Slide } from '@vibe/core/types';
import './slide.css';

/**
 * Renders one slide. Every layout is type and simple shapes — no images.
 * The union is exhaustive; an unknown layout is a programming error, not a
 * runtime case to paper over, so it renders nothing rather than a fallback
 * that would hide the bug.
 */
export function SlideView({ slide }: { slide: Slide }): ReactElement | null {
  switch (slide.layout) {
    case 'title':
      return (
        <div className="s s-title">
          {slide.kicker && <div className="s-kicker">{slide.kicker}</div>}
          <h1 className="s-h1">{slide.title}</h1>
          {slide.subtitle && <p className="s-sub">{slide.subtitle}</p>}
        </div>
      );

    case 'points':
      return (
        <div className="s">
          <h2 className="s-h2">{slide.heading}</h2>
          <ul className="s-points">
            {slide.points.map((p, i) => (
              <li key={p}>
                <em>{String(i + 1).padStart(2, '0')}</em>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      );

    case 'number':
      return (
        <div className="s">
          {slide.heading && <h2 className="s-h2">{slide.heading}</h2>}
          <div className="s-numbers">
            {slide.items.map((item) => (
              <div className="s-num" key={item.label}>
                <div className="s-num-v">{item.value}</div>
                <div className="s-num-l">{item.label}</div>
              </div>
            ))}
          </div>
          {slide.note && <p className="s-note">{slide.note}</p>}
        </div>
      );

    case 'quote':
      return (
        <div className="s s-quote-wrap">
          <blockquote className="s-quote">{slide.text}</blockquote>
          {slide.cite && <div className="s-cite">{slide.cite}</div>}
        </div>
      );

    case 'compare':
      return (
        <div className="s">
          {slide.heading && <h2 className="s-h2">{slide.heading}</h2>}
          <div className="s-compare">
            {[slide.left, slide.right].map((pane) => (
              <div className="s-pane" key={pane.title}>
                <div className="s-pane-t">{pane.title}</div>
                <ul>
                  {pane.points.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      );

    case 'flow':
      return (
        <div className="s">
          {slide.heading && <h2 className="s-h2">{slide.heading}</h2>}
          <ol className="s-flow">
            {slide.steps.map((step, i) => (
              <li key={step}>
                <span className="s-step">{step}</span>
                {i < slide.steps.length - 1 && <span className="s-arrow">→</span>}
              </li>
            ))}
          </ol>
        </div>
      );
  }
}

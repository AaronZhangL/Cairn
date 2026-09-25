import { describe, expect, test } from 'bun:test';
import { createElement, type MouseEvent, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Link, LinkProvider, type OpenLink } from '../src/Link';

const URL_ = 'https://platform.openai.com/api-keys';

/** Renders `Link` as a function inside a component, so its click handler can be called without a DOM. */
function clickHandler(open: OpenLink | undefined): (event: MouseEvent<HTMLAnchorElement>) => void {
  let handler: ((event: MouseEvent<HTMLAnchorElement>) => void) | undefined;
  const Probe = (): ReactElement => {
    const anchor = Link({ href: URL_ }) as ReactElement<{ onClick: typeof handler }>;
    handler = anchor.props.onClick;
    return anchor;
  };
  renderToStaticMarkup(createElement(LinkProvider, { open }, createElement(Probe)));
  return handler!;
}

function fakeClick(): { event: MouseEvent<HTMLAnchorElement>; prevented: () => boolean } {
  let prevented = false;
  const event = {
    get defaultPrevented() { return prevented; },
    preventDefault: () => { prevented = true; },
  } as unknown as MouseEvent<HTMLAnchorElement>;
  return { event, prevented: () => prevented };
}

describe('Link', () => {
  test('renders a new-tab anchor, so it works in a plain browser', () => {
    const html = renderToStaticMarkup(createElement(Link, { href: URL_ }, 'key'));
    expect(html).toContain(`href="${URL_}"`);
    expect(html).toContain('target="_blank"');
  });

  // The WebView drops a new-tab navigation, so under the shell the click must not reach it
  test('under a provider, the click goes to the provider instead of the page', () => {
    const opened: string[] = [];
    const { event, prevented } = fakeClick();
    clickHandler((url) => opened.push(url))(event);
    expect(opened).toEqual([URL_]);
    expect(prevented()).toBe(true);
  });

  test('without a provider, the browser handles it', () => {
    const { event, prevented } = fakeClick();
    clickHandler(undefined)(event);
    expect(prevented()).toBe(false);
  });
});

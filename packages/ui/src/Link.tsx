import { createContext, useContext } from 'react';
import type { AnchorHTMLAttributes, MouseEvent, ReactElement, ReactNode } from 'react';

/** Hands a URL to whatever can open it outside the page. */
export type OpenLink = (url: string) => void;

const LinkOpener = createContext<OpenLink | undefined>(undefined);

/** The desktop shell supplies one; without it a link is an ordinary new-tab anchor. */
export function LinkProvider({ open, children }: {
  readonly open: OpenLink | undefined;
  readonly children: ReactNode;
}): ReactElement {
  return <LinkOpener.Provider value={open}>{children}</LinkOpener.Provider>;
}

/**
 * An `<a>` to a page outside the app. The desktop WebView drops `target="_blank"`
 * navigations, so under a provider the click goes to the provider instead.
 */
export function Link({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>): ReactElement {
  const open = useContext(LinkOpener);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event);
    if (event.defaultPrevented || !open) return;
    event.preventDefault();
    if (href) open(href);
  };

  return <a href={href} target="_blank" rel="noreferrer" onClick={handleClick} {...props} />;
}

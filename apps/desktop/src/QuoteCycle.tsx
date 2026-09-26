import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';

const EVERY_MS = 8_000;

/** The book's popular highlights, one at a time, while it builds; the plain note when there are none. */
export function QuoteCycle({ quotes, fallback }: {
  quotes: readonly string[];
  fallback: string;
}): ReactElement {
  const [at, setAt] = useState(0);

  useEffect(() => {
    setAt(0);
    if (quotes.length < 2) return;
    const timer = setInterval(() => setAt((i) => (i + 1) % quotes.length), EVERY_MS);
    return () => clearInterval(timer);
  }, [quotes]);

  const quote = quotes[at];
  if (quote === undefined) return <p className="modal-hint">{fallback}</p>;
  // Keyed on the index so each quote mounts fresh and fades in
  return <blockquote className="modal-quote" key={at}>{quote}</blockquote>;
}

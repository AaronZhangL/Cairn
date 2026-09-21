import { useCallback, useEffect, useState } from 'react';
import { bookFile } from '@vibe/core/store/library';
import type { NodeDeck, Path } from '@vibe/core/types';

export interface Bundle {
  readonly path: Path;
  readonly decks: ReadonlyMap<string, NodeDeck>;
}

/** Loads one generated book from disk. Nothing is fetched from a network. */
export function useBundle(bookId: string | undefined): {
  bundle: Bundle | undefined;
  error: string | undefined;
  reload: () => void;
} {
  const [bundle, setBundle] = useState<Bundle>();
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!bookId) return;
    let live = true;
    setBundle(undefined);
    setError(undefined);

    void (async () => {
      try {
        const [path, decks] = await Promise.all([
          fetchJson<Path>(bookFile(bookId, 'path.json')),
          fetchJson<NodeDeck[]>(bookFile(bookId, 'decks-ordered.json')),
        ]);
        if (live) setBundle({ path, decks: new Map(decks.map((d) => [d.nodeId, d])) });
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();

    return () => { live = false; };
  }, [bookId, nonce]);

  return { bundle, error, reload };
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`./${path}`);
  if (!res.ok) throw new Error(`${path} 载入失败 (${res.status})`);
  return res.json() as Promise<T>;
}

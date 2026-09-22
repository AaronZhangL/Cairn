import { useCallback, useEffect, useState } from 'react';
import { bookFile } from '@cairn/core/store/library';
import type { NodeDeck, Path } from '@cairn/core/types';

export interface Bundle {
  readonly path: Path;
  readonly decks: ReadonlyMap<string, NodeDeck>;
}

/** Loads one generated book from the local library. Nothing leaves the machine. */
export function useBundle(bookId: string | undefined, base: string | undefined): {
  bundle: Bundle | undefined;
  error: string | undefined;
  reload: () => void;
} {
  const [bundle, setBundle] = useState<Bundle>();
  const [error, setError] = useState<string>();
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!bookId || !base) return;
    let live = true;
    setBundle(undefined);
    setError(undefined);

    void (async () => {
      try {
        const [path, decks] = await Promise.all([
          fetchJson<Path>(base, bookFile(bookId, 'path.json')),
          fetchJson<NodeDeck[]>(base, bookFile(bookId, 'decks-ordered.json')),
        ]);
        if (live) setBundle({ path, decks: new Map(decks.map((d) => [d.nodeId, d])) });
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    })();

    return () => { live = false; };
  }, [bookId, base, nonce]);

  return { bundle, error, reload };
}

async function fetchJson<T>(base: string, path: string): Promise<T> {
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) throw new Error(`${path} 载入失败 (${res.status})`);
  return res.json() as Promise<T>;
}

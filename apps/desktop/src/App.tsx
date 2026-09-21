import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { audioFile } from '@vibe/core/store/library';
import type { LibraryEntry } from '@vibe/core/store/library';
import { AskPane, DeckPane, StagePane, type Turn } from '@vibe/ui';
import { AddBook } from './AddBook';
import { Home } from './Home';
import { ask, askOutside, inShell, listBooks } from './bridge';
import { useBundle } from './useBundle';

export function App(): ReactElement {
  const [books, setBooks] = useState<readonly LibraryEntry[]>([]);
  const [bookId, setBookId] = useState<string>();
  const [adding, setAdding] = useState(false);
  const { bundle, error, reload } = useBundle(bookId);

  const [currentId, setCurrentId] = useState<string>();
  const [turns, setTurns] = useState<readonly Turn[]>([]);
  const [selection, setSelection] = useState<string>();

  useEffect(() => {
    void (async () => {
      // The shelf is listed, but nothing is opened: the entry point is the drop zone
      setBooks(await listBooks().catch(() => []));
    })();
  }, []);

  const path = bundle?.path;
  const node = useMemo(
    () => path?.nodes.find((n) => n.id === currentId) ?? path?.nodes[0],
    [path, currentId],
  );

  const step = useCallback((delta: number) => {
    if (!path || !node) return;
    const next = path.nodes[node.idx + delta];
    if (next) setCurrentId(next.id);
  }, [path, node]);

  // Stations only. Transport keys (← → space) belong to the deck.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step]);

  const askQuestion = useCallback(async (question: string) => {
    if (!node || !bookId) return;
    const id = `t${Date.now()}`;
    const sel = selection;
    setSelection(undefined);
    setTurns((t) => [...t, { id, question, selection: sel, pending: true }]);

    const answer = await ask({
      bookId, question, selection: sel, nodeId: node.id, sourceChapters: node.sourceChapters,
    });
    setTurns((t) => t.map((x) => (x.id === id ? { ...x, answer, pending: false } : x)));
  }, [node, bookId, selection]);

  // Going outside the book is the reader's call, never the model's
  const searchOutside = useCallback(async (turnId: string) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn || !path) return;
    const outside = await askOutside(turn.question, path.title);
    setTurns((t) => t.map((x) => (x.id === turnId ? { ...x, outside } : x)));
  }, [turns, path]);

  const onAdded = useCallback((entry: LibraryEntry) => {
    setBooks((b) => [entry, ...b.filter((x) => x.id !== entry.id)]);
    setAdding(false);
    setCurrentId(undefined);
    setTurns([]);
    if (entry.id === bookId) reload(); else setBookId(entry.id);
  }, [bookId, reload]);

  const goHome = useCallback(() => {
    setBookId(undefined);
    setCurrentId(undefined);
    setTurns([]);
  }, []);

  const modal = adding
    ? <AddBook autoPick onDone={onAdded} onClose={() => setAdding(false)} />
    : null;

  if (!bookId) {
    return (
      <div className="shell empty">
        <Home books={books} onAdd={() => setAdding(true)} onOpen={setBookId} />
        {modal}
      </div>
    );
  }

  if (!bundle || !path || !node) {
    return (
      <div className="shell empty">
        <div className="deck-empty">
          {error ?? '载入中…'}
          <button type="button" className="ghost" onClick={goHome}>返回书架</button>
        </div>
        {modal}
      </div>
    );
  }

  return (
    <div className="shell">
      <StagePane
        path={path}
        decks={bundle.decks}
        currentId={node.id}
        onPick={setCurrentId}
        books={books}
        onSwitchBook={(id) => { setBookId(id); setCurrentId(undefined); setTurns([]); }}
        onAdd={inShell ? () => setAdding(true) : undefined}
        onHome={goHome}
      />

      <DeckPane
        node={node}
        deck={bundle.decks.get(node.id)}
        audioSrc={`./${audioFile(path.bookId, node.id)}`}
        onSelect={setSelection}
        onEnded={() => step(1)}
      />

      <AskPane
        turns={turns}
        onAsk={askQuestion}
        onSearchOutside={searchOutside}
        onJumpToChapter={() => undefined}
      />

      {modal}
    </div>
  );
}

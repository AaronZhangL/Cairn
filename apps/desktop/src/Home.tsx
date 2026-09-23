import { useState } from 'react';
import type { ReactElement } from 'react';
import { payloadOf } from '@cairn/core/errors';
import { ACCEPTED_EXTENSIONS } from '@cairn/core/parse';
import type { LibraryEntry } from '@cairn/core/store/library';
import { errorText, GearMark, TrashMark, useT } from '@cairn/ui';
import { inShell } from './bridge';

/**
 * The first screen: put a book in.
 *
 * Opening straight into whichever book happens to be first in the library made
 * the app look like it owned that book. The entry point is the drop zone; the
 * shelf below it is for walking a path again, and nothing opens until it is picked.
 */
export function Home({
  books, onAdd, onOpen, onDelete, onSettings,
}: {
  books: readonly LibraryEntry[];
  onAdd: () => void;
  onOpen: (bookId: string) => void;
  /** Absent outside the desktop shell, where there is no main process to delete with. */
  onDelete?: (bookId: string) => Promise<void>;
  onSettings: () => void;
}): ReactElement {
  const t = useT();
  /** Deleting is irreversible and the rows are small, so it takes two clicks. */
  const [confirming, setConfirming] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [failed, setFailed] = useState<{ id: string; why: string }>();

  const remove = async (bookId: string): Promise<void> => {
    setBusy(bookId);
    setFailed(undefined);
    try {
      await onDelete?.(bookId);
      setConfirming(undefined);
    } catch (cause) {
      setFailed({ id: bookId, why: errorText(payloadOf(cause), t) });
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="home">
      <header className="home-head">
        <h1>Cairn</h1>
        <p>{t.home.tagline}</p>
        {/* The only way in from the shelf; inside a book it is in the book menu. */}
        <button
          type="button"
          className="home-gear"
          onClick={onSettings}
          aria-label={t.home.settings}
          title={`${t.home.settings} (⌘,)`}
        >
          <GearMark />
        </button>
      </header>

      <button type="button" className="drop-zone" onClick={onAdd} disabled={!inShell}>
        <span className="drop-title">{t.home.dropTitle}</span>
        <span className="drop-sub">{t.home.dropSub(ACCEPTED_EXTENSIONS.join(' / '))}</span>
        <span className="drop-cta">{inShell ? t.home.dropCta : t.home.devCta}</span>
      </button>

      {books.length > 0 && (
        <section className="shelf">
          <h2 className="shelf-title">{t.home.shelf}</h2>
          {books.map((b) => (
            <div className="shelf-row" key={b.id}>
              <button type="button" className="shelf-item" onClick={() => onOpen(b.id)}>
                <span className="shelf-name">{b.title}</span>
                <span className="shelf-meta">
                  {t.unit.count(b.stations)} · {b.complete === false ? t.unit.approx : ''}
                  {t.unit.minutes(b.minutes)}
                  {b.complete === false && (
                    <span className="shelf-building">
                      {t.home.built(b.built ?? 0, b.stations)}
                    </span>
                  )}
                  {b.author ? ` · ${b.author}` : ''}
                </span>
              </button>

              {onDelete && (confirming === b.id ? (
                <span className="shelf-confirm">
                  <span
                    className={failed?.id === b.id ? 'shelf-ask bad' : 'shelf-ask'}
                    title={failed?.id === b.id ? failed.why : undefined}
                  >
                    {failed?.id === b.id ? failed.why : t.home.deleteAsk}
                  </span>
                  <button
                    type="button"
                    className="shelf-act danger"
                    disabled={busy === b.id}
                    onClick={() => void remove(b.id)}
                  >
                    {busy === b.id ? t.home.deleting : t.home.delete}
                  </button>
                  <button
                    type="button"
                    className="shelf-act"
                    disabled={busy === b.id}
                    onClick={() => { setConfirming(undefined); setFailed(undefined); }}
                  >
                    {t.home.cancel}
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="shelf-del"
                  aria-label={t.home.deleteAria(b.title)}
                  title={t.home.deleteTitle}
                  onClick={() => setConfirming(b.id)}
                >
                  <TrashMark />
                </button>
              ))}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

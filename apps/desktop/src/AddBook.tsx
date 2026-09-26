import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import type { BudgetId } from '@cairn/core/pipeline/budget';
import type { LibraryEntry } from '@cairn/core/store/library';
import { errorText, useT } from '@cairn/ui';
import { payloadOf } from '@cairn/core/errors';
import { generateBook, onProgress, pickBook, progressNow } from './bridge';
import { VOICES } from './shared/settings';
import type { BookPreview, Progress } from './shared/types';

/** The voice's own name, without repeating the language beside it. */
function voiceName(id: string): string {
  return Object.values(VOICES).flat().find((v) => v.id === id)?.name ?? id;
}

/** Slow enough to be free, fast enough that a finished batch shows up promptly. */
const POLL_MS = 1500;

/**
 * Adding a book, in three steps: pick a file, choose how long you want to spend,
 * then watch it build. The budget choice comes after parsing so it can be made
 * knowing how long the book actually is.
 */
export function AddBook({
  onDone, onClose, autoPick = false,
}: {
  onDone: (entry: LibraryEntry) => void;
  onClose: () => void;
  /** Opened from the drop zone, where picking a file was already the click. */
  autoPick?: boolean;
}): ReactElement {
  const t = useT();
  const [preview, setPreview] = useState<BookPreview>();
  const [progress, setProgress] = useState<Progress>();
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string>();
  /** The native dialog is not idempotent: opening it twice stacks two windows. */
  const picked = useRef(false);

  const polling = progress !== undefined && progress.stage !== 'done';

  useEffect(() => onProgress(setProgress), []);

  // A run takes minutes; one dropped message would freeze the bar for all of it
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => {
      void progressNow().then((p) => { if (p) setProgress(p); });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [polling]);

  useEffect(() => {
    // Mount only, and only once: StrictMode runs mount effects twice in dev, and
    // a second openFileDialog puts a second native window over the first.
    if (!autoPick || picked.current) return;
    picked.current = true;
    void pick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (): Promise<void> => {
    setError(undefined);
    setParsing(true);
    try {
      const chosen = await pickBook();
      // Cancelling the dialog is not an error; close rather than sit on a dead screen
      if (chosen) setPreview(chosen); else if (autoPick) onClose();
    } catch (e) {
      setError(errorText(payloadOf(e), t));
    } finally {
      setParsing(false);
    }
  };

  const run = async (budgetId: BudgetId): Promise<void> => {
    if (!preview) return;
    setError(undefined);
    setProgress({ stage: 'map', done: 0, total: 1 });
    try {
      onDone(await generateBook(preview.filePaths, budgetId));
    } catch (e) {
      setError(errorText(payloadOf(e), t));
      setProgress(undefined);
    }
  };

  const running = progress !== undefined;

  return (
    <div className="modal-scrim" onClick={running ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!preview && !running && (
          <>
            <h2>{t.add.title}</h2>
            <p className="modal-sub">
              {/* A 14 MB EPUB takes a moment to parse, and a frozen dialog looks broken */}
              {parsing ? t.add.parsing : t.add.supported}
            </p>
            <button type="button" className="primary" onClick={pick} disabled={parsing}>
              {parsing ? t.add.picking : t.add.pick}
            </button>
          </>
        )}

        {preview && !running && (
          <>
            <h2>{preview.title}</h2>
            <p className="modal-sub">
              {preview.author ? `${preview.author} · ` : ''}
              {t.unit.count(preview.chapters)} · {t.unit.words(preview.words)}
            </p>
            {/* Before the budget, because it is the one decision that cannot be
                changed afterwards without rebuilding the whole book. */}
            <p className="modal-narration">
              {t.add.narratedIn(
                t.add.languageName[preview.narration.locale],
                voiceName(preview.narration.voice),
              )}
            </p>
            <p className="modal-label">{t.add.howLong}</p>
            <div className="budget-list">
              {preview.budgets.map((b) => (
                <button
                  type="button"
                  key={b.id}
                  className={b.recommended ? 'budget recommended' : 'budget'}
                  onClick={() => void run(b.id)}
                >
                  <span className="budget-label">
                    {t.add.budgetLabel(
                      t.unit.duration(b.minutes),
                      t.settings.narration.budgets[b.id],
                    )}
                    {b.recommended && <em>{t.add.recommended}</em>}
                  </span>
                  {/* A budget that would distort this book is offered, but labelled */}
                  {!b.honest && b.wordsPerNode !== undefined && (
                    <span className="budget-note">⚠ {t.add.budgetWarning(b.wordsPerNode)}</span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" className="ghost" onClick={() => setPreview(undefined)}>
              {t.add.another}
            </button>
          </>
        )}

        {running && progress && (
          <>
            <h2>{preview?.title ?? t.add.generating}</h2>
            <p className="modal-sub">
              {t.add.stages[progress.stage]}
              {progress.total > 1 && ` · ${progress.done}/${progress.total}`}
            </p>
            <div className="prog">
              <i style={{ width: `${pct(progress)}%` }} />
            </div>
            <p className="modal-hint">
              {t.add.note}
            </p>
          </>
        )}

        {error && <p className="modal-error">{error}</p>}
      </div>
    </div>
  );
}

/** Weight the stages by how long they actually take, so the bar does not stall. */
function pct(p: Progress): number {
  const spans: Record<Progress['stage'], [number, number]> = {
    map: [0, 55], classify: [55, 60], reduce: [60, 68], decks: [68, 100], done: [100, 100],
  };
  const [from, to] = spans[p.stage];
  const within = p.total > 0 ? p.done / p.total : 0;
  return Math.round(from + (to - from) * within);
}

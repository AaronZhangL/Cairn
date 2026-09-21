import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import type { BudgetId } from '@vibe/core/pipeline/budget';
import type { LibraryEntry } from '@vibe/core/store/library';
import { generateBook, onProgress, pickBook } from './bridge';
import type { BookPreview, Progress } from './shared/types';

const STAGE_LABEL: Record<Progress['stage'], string> = {
  map: '逐章压缩',
  classify: '判定类型',
  reduce: '设计路径',
  decks: '生成幻灯与口播',
  done: '完成',
};

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
  const [preview, setPreview] = useState<BookPreview>();
  const [progress, setProgress] = useState<Progress>();
  const [error, setError] = useState<string>();

  useEffect(() => onProgress(setProgress), []);

  useEffect(() => {
    if (autoPick) void pick();
    // Mount only: re-picking on every render would reopen the native dialog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pick = async (): Promise<void> => {
    setError(undefined);
    try {
      const picked = await pickBook();
      if (picked) setPreview(picked);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const run = async (budgetId: BudgetId): Promise<void> => {
    if (!preview) return;
    setError(undefined);
    setProgress({ stage: 'map', done: 0, total: 1 });
    try {
      onDone(await generateBook(preview.filePath, budgetId));
    } catch (e) {
      setError((e as Error).message);
      setProgress(undefined);
    }
  };

  const running = progress !== undefined;

  return (
    <div className="modal-scrim" onClick={running ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!preview && !running && (
          <>
            <h2>添加一本书</h2>
            <p className="modal-sub">支持 EPUB / TXT / Markdown。书不会离开这台机器。</p>
            <button type="button" className="primary" onClick={pick}>选择文件…</button>
          </>
        )}

        {preview && !running && (
          <>
            <h2>{preview.title}</h2>
            <p className="modal-sub">
              {preview.author ? `${preview.author} · ` : ''}
              {preview.chapters} 章 · {preview.words.toLocaleString()} 字
            </p>
            <p className="modal-label">想花多久走完？</p>
            <div className="budget-list">
              {preview.budgets.map((b) => (
                <button
                  type="button"
                  key={b.id}
                  className={b.recommended ? 'budget recommended' : 'budget'}
                  onClick={() => void run(b.id)}
                >
                  <span className="budget-label">
                    {b.label}
                    {b.recommended && <em>推荐</em>}
                  </span>
                  {/* A budget that would distort this book is offered, but labelled */}
                  {!b.honest && b.note && <span className="budget-note">⚠ {b.note}</span>}
                </button>
              ))}
            </div>
            <button type="button" className="ghost" onClick={() => setPreview(undefined)}>
              换一本
            </button>
          </>
        )}

        {running && progress && (
          <>
            <h2>{preview?.title ?? '生成中'}</h2>
            <p className="modal-sub">
              {STAGE_LABEL[progress.stage]}
              {progress.total > 1 && ` · ${progress.done}/${progress.total}`}
            </p>
            <div className="prog">
              <i style={{ width: `${pct(progress)}%` }} />
            </div>
            <p className="modal-hint">
              整本书只读一遍，中断后可以从断点继续。几十章的书通常要几分钟。
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

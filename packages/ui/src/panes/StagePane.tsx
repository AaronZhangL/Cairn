import type { ReactElement } from 'react';
import type { NodeDeck, Path, PathNode } from '@vibe/core/types';
import type { LibraryEntry } from '@vibe/core/store/library';

/**
 * Left pane: stages and their stations.
 * Jumping around is allowed — this is a personal tool, not a course with a gate.
 */
export function StagePane({
  path, decks, currentId, onPick, books = [], onSwitchBook, onAdd, onHome,
}: {
  path: Path;
  decks: ReadonlyMap<string, NodeDeck>;
  currentId: string;
  onPick: (nodeId: string) => void;
  books?: readonly LibraryEntry[];
  onSwitchBook?: (bookId: string) => void;
  /** Absent outside the desktop shell, where generation is not possible. */
  onAdd?: () => void;
  /** Back to the shelf. */
  onHome?: () => void;
}): ReactElement {
  const byId = new Map(path.nodes.map((n) => [n.id, n]));
  const currentIdx = byId.get(currentId)?.idx ?? 0;

  return (
    <nav className="pane stage-pane">
      <header className="stage-head">
        <div className="stage-head-row">
          {onHome && (
            <button type="button" className="add-book" onClick={onHome} title="返回书架">
              ‹
            </button>
          )}
          {books.length > 1 && onSwitchBook ? (
            <select
              className="book-switch"
              value={path.bookId}
              onChange={(e) => onSwitchBook(e.target.value)}
            >
              {books.map((b) => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          ) : (
            <div className="stage-title">{path.title}</div>
          )}
          {onAdd && (
            <button type="button" className="add-book" onClick={onAdd} title="添加一本书">
              ＋
            </button>
          )}
        </div>
        <div className="stage-meta">
          {path.nodes.length} 站 · 约 {path.totalMinutes} 分钟
        </div>
      </header>

      {path.stages.map((stage) => (
        <section key={stage.title}>
          <h3 className="stage-name">{stage.title}</h3>
          {stage.nodeIds.map((id) => {
            const node = byId.get(id);
            if (!node) return null;
            return (
              <StationRow
                key={id}
                node={node}
                state={node.idx < currentIdx ? 'done' : node.idx === currentIdx ? 'current' : 'ahead'}
                minutes={minutesOf(decks.get(id), node)}
                onPick={onPick}
              />
            );
          })}
        </section>
      ))}
    </nav>
  );
}

function StationRow({
  node, state, minutes, onPick,
}: {
  node: PathNode;
  state: 'done' | 'current' | 'ahead';
  minutes: number;
  onPick: (nodeId: string) => void;
}): ReactElement {
  return (
    <button type="button" className={`station ${state}`} onClick={() => onPick(node.id)}>
      <span className="station-mark">{state === 'done' ? '✓' : node.idx + 1}</span>
      <span className="station-title">{node.title}</span>
      <span className="station-min">{minutes}′</span>
    </button>
  );
}

/** Show the real audio length once it exists; fall back to the estimate before that. */
function minutesOf(deck: NodeDeck | undefined, node: PathNode): number {
  return deck ? Math.max(1, Math.round(deck.durationMs / 60_000)) : node.estMinutes;
}

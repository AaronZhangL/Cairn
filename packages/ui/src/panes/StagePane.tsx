import type { ReactElement } from 'react';
import type { NodeDeck, Path, PathNode } from '@cairn/core/types';
import type { LibraryEntry } from '@cairn/core/store/library';
import { BookMenu } from './BookMenu';

/**
 * Left pane: stages and their stations.
 * Jumping around is allowed — this is a personal tool, not a course with a gate.
 */
export function StagePane({
  path, decks, currentId, onPick, books = [], onSwitchBook, onAdd, onHome,
  collapsed = false,
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
  /** Collapsed panes keep their grid slot, or the columns would shift. */
  collapsed?: boolean;
}): ReactElement {
  if (collapsed) return <nav className="pane stage-pane collapsed" />;

  const byId = new Map(path.nodes.map((n) => [n.id, n]));
  const currentIdx = byId.get(currentId)?.idx ?? 0;

  return (
    <nav className="pane stage-pane">
      <header className="stage-head">
        {/* The fold switch is pinned to the window corner over this row's left
            padding, so folding the pane cannot move it. */}
        <div className="stage-head-row">
          <BookMenu
            title={path.title}
            books={books}
            currentId={path.bookId}
            onSwitch={onSwitchBook}
            onAdd={onAdd}
            onHome={onHome}
          />
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

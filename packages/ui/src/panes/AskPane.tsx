import {useState } from 'react';
import type { ReactElement } from 'react';
import type { Answer } from '@cairn/core/pipeline/ask';
import type { OutsideAnswer } from '@cairn/core/pipeline/ask-outside';

export interface Turn {
  readonly id: string;
  readonly question: string;
  readonly selection?: string;
  readonly answer?: Answer;
  /** Kept separate from `answer` on purpose — see BookAnswer/WebAnswer below. */
  readonly outside?: OutsideAnswer;
  readonly pending?: boolean;
}

/**
 * Right pane. Book-sourced and web-sourced statements render as separate blocks
 * and are never merged into one paragraph: the reader has not read the book, so
 * a blended answer would leave them unable to tell which claim came from where.
 */
export function AskPane({
  turns, onAsk, onSearchOutside, onJumpToChapter, collapsed = false,
}: {
  turns: readonly Turn[];
  onAsk: (question: string) => void;
  onSearchOutside: (turnId: string) => void;
  onJumpToChapter: (chapter: number) => void;
  /** Collapsed panes keep their grid slot, or the columns would shift. */
  collapsed?: boolean;
}): ReactElement {
  const [draft, setDraft] = useState('');

  if (collapsed) return <aside className="pane ask-pane collapsed" />;

  return (
    <aside className="pane ask-pane">
      <div className="ask-scroll">
        {turns.length === 0 && (
          <p className="ask-hint">划中字幕里的一段，或直接提问。</p>
        )}

        {turns.map((turn) => (
          <div className="turn" key={turn.id}>
            {turn.selection && <blockquote className="sel">{turn.selection}</blockquote>}
            <div className="q">{turn.question}</div>

            {turn.pending && <div className="a pending">思考中…</div>}

            {turn.answer && (
              <BookAnswer
                answer={turn.answer}
                onJumpToChapter={onJumpToChapter}
                onSearchOutside={() => onSearchOutside(turn.id)}
                searched={turn.outside !== undefined}
              />
            )}

            {turn.outside && <WebAnswer answer={turn.outside} />}
          </div>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          const q = draft.trim();
          if (q) { onAsk(q); setDraft(''); }
        }}
      >
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="问点什么…" />
        <button type="submit">问</button>
      </form>
    </aside>
  );
}

function BookAnswer({
  answer, onJumpToChapter, onSearchOutside, searched,
}: {
  answer: Answer;
  onJumpToChapter: (chapter: number) => void;
  onSearchOutside: () => void;
  searched: boolean;
}): ReactElement {
  return (
    <div className={answer.grounded ? 'a book' : 'a book ungrounded'}>
      <div className="src-tag">书里说</div>
      <p>{answer.text}</p>

      {answer.suggestion && <p className="suggest">{answer.suggestion}</p>}

      {answer.sourceChapters.length > 0 && (
        <div className="chips">
          {answer.sourceChapters.map((c) => (
            <button type="button" key={c} className="chip" onClick={() => onJumpToChapter(c)}>
              第 {c} 章
            </button>
          ))}
        </div>
      )}

      {/* Going outside the book is the reader's call, never the model's */}
      {!answer.grounded && !searched && (
        <button type="button" className="go-search" onClick={onSearchOutside}>
          这本书里没讲到，要我去网上查吗？
        </button>
      )}
    </div>
  );
}

function WebAnswer({ answer }: { answer: OutsideAnswer }): ReactElement {
  return (
    <div className="a web">
      <div className="src-tag web-tag">书外补充 · 来自网络</div>
      <p>{answer.text}</p>
      <ul className="cites">
        {answer.citations.map((c) => (
          <li key={c.url}>
            <a href={c.url} target="_blank" rel="noreferrer">{c.title}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

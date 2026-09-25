import { useState, type ReactElement } from 'react';
import type { ChatMessage, Citation } from '@cairn/core/companion/types';
import { Link } from '../Link';
import { useT } from '../settings/SettingsProvider';

export interface CitationPart {
  readonly text: string;
  readonly citations: readonly Citation[];
}

export function citationParts(text: string, citations: readonly Citation[]): readonly CitationPart[] {
  const ends = [...new Set(citations.map((citation) => citation.span[1]).filter((end) => end > 0 && end <= text.length))]
    .sort((a, b) => a - b);
  if (ends.at(-1) !== text.length) ends.push(text.length);
  let start = 0;
  return ends.map((end) => {
    const part = { text: text.slice(start, end), citations: citations.filter((citation) => citation.span[1] === end) };
    start = end;
    return part;
  });
}

export function CompanionPane({
  messages, pending, draftAnswer, error, errorCode, selection, collapsed = false,
  onAsk, onCancel, onClearSelection, onJumpToChapter, onOpenShelf,
}: {
  messages: readonly ChatMessage[];
  pending: boolean;
  draftAnswer?: string;
  error?: string;
  errorCode?: string;
  selection?: string;
  collapsed?: boolean;
  onAsk: (question: string) => void;
  onCancel: () => void;
  onClearSelection: () => void;
  onJumpToChapter: (chapter: number) => boolean;
  onOpenShelf: (bookId: string, nodeId: string) => void;
}): ReactElement {
  const t = useT();
  const [draft, setDraft] = useState('');
  if (collapsed) return <aside className="pane ask-pane collapsed" />;

  const revealTool = (resultId: string): void => {
    const tool = document.getElementById(`source-${resultId}`);
    if (tool instanceof HTMLDetailsElement) {
      tool.open = true;
      tool.scrollIntoView({ block: 'nearest' });
    }
  };

  const sourceLink = (citation: Citation, index: number): ReactElement => {
    const ref = citation.ref;
    if (citation.source === 'web' && 'url' in ref) {
      return <Link className="chip" key={index} href={ref.url} title={ref.title}>{ref.title.slice(0, 32) || t.companion.webSource}</Link>;
    }
    if (citation.source === 'book' && 'chapter' in ref) {
      return <button className="chip" type="button" key={index} onClick={() => {
        if (!onJumpToChapter(ref.chapter)) revealTool(citation.resultId);
      }} title={ref.title}>{t.companion.chapter(ref.chapter)}</button>;
    }
    if (citation.source === 'shelf' && 'bookId' in ref) {
      return <button className="chip" type="button" key={index} onClick={() => onOpenShelf(ref.bookId, ref.nodeId)} title={`${ref.bookTitle} · ${ref.nodeTitle}`}>{`${ref.bookTitle} · ${ref.nodeTitle}`.slice(0, 32) || t.companion.readingSource}</button>;
    }
    return <span key={index} />;
  };

  return <aside className="pane ask-pane">
    <div className="ask-scroll" aria-live="polite">
      {messages.map((message) => {
        if (message.role === 'tool') return <details className="companion-tool" key={message.id} id={`source-${message.resultId}`}><summary>{message.name}</summary><pre>{message.text}</pre></details>;
        if (message.role === 'user') return <div className="q" key={message.id}>{message.selection && <blockquote className="sel">{message.selection}</blockquote>}{message.text}</div>;
        return <div className="a book" key={message.id}>
          {citationParts(message.text, message.citations).map((part, index) =>
            <span key={index}>{part.text}{part.citations.map(sourceLink)}</span>)}
          {message.options && <div className="chips">{message.options.map((option) =>
            <button type="button" className="chip" key={option} onClick={() => onAsk(option)} disabled={pending}>{option}</button>)}</div>}
        </div>;
      })}
      {pending && <div className="a pending">{draftAnswer || t.companion.thinking}</div>}
      {error && <div className="a companion-error" role="alert">{errorCode ? t.companion.error(errorCode) : error}</div>}
    </div>
    {/* Compaction is the turn's own business — `runTurn` summarises when the
        context is nearly full, so there is nothing here to press. */}
    {pending && <div className="companion-actions">
      <button type="button" onClick={onCancel}>{t.companion.stop}</button>
    </div>}
    {selection && <div className="sel-pending"><blockquote className="sel">{selection}</blockquote><button type="button" className="sel-drop" onClick={onClearSelection} aria-label={t.ask.dropQuote}>×</button></div>}
    <form className="composer" onSubmit={(event) => { event.preventDefault(); const question = draft.trim(); if (question && !pending) { onAsk(question); setDraft(''); } }}>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={t.companion.placeholder} />
      <button type="submit" disabled={!draft.trim() || pending}>{t.companion.send}</button>
    </form>
  </aside>;
}

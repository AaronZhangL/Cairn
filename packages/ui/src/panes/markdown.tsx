import { Fragment, type ReactElement, type ReactNode } from 'react';
import { Link } from '../Link';

export type Block =
  | { readonly kind: 'p' | 'quote' | 'code'; readonly text: string }
  | { readonly kind: 'h'; readonly level: number; readonly text: string }
  | { readonly kind: 'ul' | 'ol'; readonly items: readonly string[] };

export type Inline =
  | { readonly kind: 'text' | 'strong' | 'em' | 'code'; readonly text: string }
  | { readonly kind: 'link'; readonly text: string; readonly href: string };

const FENCE = /^\s*```/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*([^*\s](?:[^*]*[^*\s])?)\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;

function startsBlock(line: string): boolean {
  return FENCE.test(line) || HEADING.test(line) || BULLET.test(line) || NUMBERED.test(line) || QUOTE.test(line);
}

function takeWhile(lines: readonly string[], from: number, pattern: RegExp): { readonly items: string[]; readonly next: number } {
  const items: string[] = [];
  let index = from;
  for (let match = pattern.exec(lines[index] ?? ''); match; match = pattern.exec(lines[index] ?? '')) {
    items.push(match[1] ?? '');
    index += 1;
  }
  return { items, next: index };
}

export function parseBlocks(text: string): readonly Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (!line.trim()) { index += 1; continue; }
    if (FENCE.test(line)) {
      const end = lines.findIndex((candidate, at) => at > index && FENCE.test(candidate));
      const stop = end === -1 ? lines.length : end;
      blocks.push({ kind: 'code', text: lines.slice(index + 1, stop).join('\n') });
      index = stop + 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ kind: 'h', level: heading[1]?.length ?? 1, text: heading[2] ?? '' });
      index += 1;
      continue;
    }
    const list = BULLET.test(line) ? { kind: 'ul' as const, pattern: BULLET }
      : NUMBERED.test(line) ? { kind: 'ol' as const, pattern: NUMBERED } : undefined;
    if (list) {
      const { items, next } = takeWhile(lines, index, list.pattern);
      blocks.push({ kind: list.kind, items });
      index = next;
      continue;
    }
    if (QUOTE.test(line)) {
      const { items, next } = takeWhile(lines, index, QUOTE);
      blocks.push({ kind: 'quote', text: items.join('\n') });
      index = next;
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && lines[index]?.trim() && !startsBlock(lines[index] ?? '')) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push({ kind: 'p', text: paragraph.join('\n') });
  }
  return blocks;
}

export function parseInline(text: string): readonly Inline[] {
  const parts: Inline[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push({ kind: 'text', text: text.slice(cursor, at) });
    const [, code, strong, strongAlt, em, label, href] = match;
    if (code !== undefined) parts.push({ kind: 'code', text: code });
    else if (strong !== undefined || strongAlt !== undefined) parts.push({ kind: 'strong', text: strong ?? strongAlt ?? '' });
    else if (em !== undefined) parts.push({ kind: 'em', text: em });
    else if (label !== undefined && href !== undefined) parts.push({ kind: 'link', text: label, href });
    cursor = at + match[0].length;
  }
  if (cursor < text.length) parts.push({ kind: 'text', text: text.slice(cursor) });
  return parts;
}

/** Private-use characters stand in for citation chips, so they survive parsing at the offset they were cited at. */
const MARK_BASE = 0xe000;
const MARK = /[-]/;

export function markCitations(text: string, ends: readonly number[]): string {
  const sorted = [...ends.entries()].sort((a, b) => a[1] - b[1]);
  let marked = '';
  let cursor = 0;
  for (const [index, end] of sorted) {
    marked += text.slice(cursor, end) + String.fromCharCode(MARK_BASE + index);
    cursor = end;
  }
  return marked + text.slice(cursor);
}

type RenderMark = (index: number) => ReactNode;

function withMarks(text: string, renderMark: RenderMark): ReactNode {
  if (!MARK.test(text)) return text;
  return [...text].map((char, at) => {
    const code = char.charCodeAt(0);
    return MARK.test(char) ? <Fragment key={at}>{renderMark(code - MARK_BASE)}</Fragment> : char;
  });
}

function renderInline(text: string, renderMark: RenderMark): ReactNode {
  return parseInline(text).map((part, at) => {
    const inner = withMarks(part.text, renderMark);
    switch (part.kind) {
      case 'strong': return <strong key={at}>{inner}</strong>;
      case 'em': return <em key={at}>{inner}</em>;
      case 'code': return <code key={at}>{inner}</code>;
      case 'link': return <Link key={at} href={part.href}>{inner}</Link>;
      default: return <Fragment key={at}>{inner}</Fragment>;
    }
  });
}

export function Markdown({ text, renderMark = () => null }: { text: string; renderMark?: RenderMark }): ReactElement {
  return <div className="md">{parseBlocks(text).map((block, at) => {
    switch (block.kind) {
      case 'h': return <p key={at} className="md-h">{renderInline(block.text, renderMark)}</p>;
      case 'code': return <pre key={at}><code>{withMarks(block.text, renderMark)}</code></pre>;
      case 'quote': return <blockquote key={at}>{renderInline(block.text, renderMark)}</blockquote>;
      case 'ul': return <ul key={at}>{block.items.map((item, i) => <li key={i}>{renderInline(item, renderMark)}</li>)}</ul>;
      case 'ol': return <ol key={at}>{block.items.map((item, i) => <li key={i}>{renderInline(item, renderMark)}</li>)}</ol>;
      default: return <p key={at}>{renderInline(block.text, renderMark)}</p>;
    }
  })}</div>;
}

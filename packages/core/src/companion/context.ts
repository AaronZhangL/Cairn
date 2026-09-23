import type { ChatMessage } from './types';
import { escapeXml } from './xml';

export interface ContextInput {
  readonly path: {
    readonly title: string;
    readonly nodes: readonly {
      readonly id: string;
      readonly title: string;
      readonly brief: string;
      readonly sourceChapters: readonly number[];
    }[];
  };
  readonly chapters: readonly { readonly idx: number; readonly title: string; readonly gist: string }[];
  readonly shelf: readonly { readonly bookId: string; readonly title: string; readonly claim: string }[];
  readonly summary?: string;
  readonly messages: readonly ChatMessage[];
  readonly atNode?: string;
}

export function buildContext(input: ContextInput): string {
  const stations = input.path.nodes.map((node) =>
    `<station id="${escapeXml(node.id)}" chapters="${node.sourceChapters.join(',')}" title="${escapeXml(node.title)}">${escapeXml(node.brief)}</station>`,
  ).join('');
  const chapters = input.chapters.map((chapter) =>
    `<chapter idx="${chapter.idx}" title="${escapeXml(chapter.title)}">${escapeXml(chapter.gist)}</chapter>`,
  ).join('');
  const shelf = input.shelf.map((book) =>
    `<book id="${escapeXml(book.bookId)}" title="${escapeXml(book.title)}">${escapeXml(book.claim)}</book>`,
  ).join('');
  const conversation = input.messages.map((message) => {
    const name = message.role === 'tool' ? ` name="${escapeXml(message.name)}" result_id="${escapeXml(message.resultId)}"` : '';
    return `<message role="${message.role}"${name}>${escapeXml(message.text)}</message>`;
  }).join('');
  return `<reading_context><current_book title="${escapeXml(input.path.title)}" at_station="${escapeXml(input.atNode ?? '')}">${stations}</current_book><chapter_index>${chapters}</chapter_index><finished_books>${shelf}</finished_books><prior_summary>${escapeXml(input.summary ?? '')}</prior_summary><conversation>${conversation}</conversation></reading_context>`;
}

export function completeTurnBoundary(messages: readonly ChatMessage[], target: number): number {
  if (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant') return 0;
  const start = Math.max(0, Math.min(target, messages.length - 1));
  for (let idx = start; idx < messages.length; idx += 1) {
    if (messages[idx]?.role === 'user') return idx;
  }
  return 0;
}

export function retainedMessages(messages: readonly ChatMessage[], recentCount: number): readonly ChatMessage[] {
  const boundary = completeTurnBoundary(messages, messages.length - recentCount);
  return messages.slice(boundary);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

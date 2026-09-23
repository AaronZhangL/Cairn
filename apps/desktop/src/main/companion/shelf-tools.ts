import { randomUUID } from 'node:crypto';
import type { Path } from '@cairn/core/types';
import type { LibraryEntry } from '@cairn/core/store/library';
import { isFinished, type ReadingRecord } from '@cairn/core/store/reading';
import type { EvidenceRecord, ShelfRef } from '@cairn/core/companion/types';
import { escapeXml } from '@cairn/core/companion/xml';
import { listBooks } from '../install';
import { readReadingRecord } from '../reading';
import { loadPath } from '../store';

const MAX_STATIONS = 8;
const MAX_QUERY = 200;

export class ShelfToolError extends Error {
  constructor(readonly code: 'invalid_query') {
    super(code);
    this.name = 'ShelfToolError';
  }
}

export interface ShelfRecallResult {
  readonly resultId: string;
  readonly text: string;
  readonly evidence: EvidenceRecord;
}

interface ShelfToolDeps {
  readonly listBooks: () => Promise<readonly LibraryEntry[]>;
  readonly loadPath: (bookId: string) => Promise<Path>;
  readonly readReadingRecord: (bookId: string) => Promise<ReadingRecord | undefined>;
}

const live: ShelfToolDeps = { listBooks, loadPath, readReadingRecord };

function boundedXml(value: string, limit: number): string {
  let text = '';
  for (const character of value) {
    const escaped = escapeXml(character);
    if (text.length + escaped.length > limit) break;
    text += escaped;
  }
  return text;
}

function queryTerms(query: string): string[] {
  const words = query.toLocaleLowerCase().match(/[\p{Script=Han}]+|[\p{L}\p{N}]+/gu) ?? [];
  return words.flatMap((word) => /\p{Script=Han}/u.test(word) && word.length > 2
    ? Array.from({ length: word.length - 1 }, (_, index) => word.slice(index, index + 2))
    : [word]);
}

export async function recallReading(
  query: string, currentBookId: string, deps: ShelfToolDeps = live,
): Promise<ShelfRecallResult> {
  const terms = queryTerms(query.trim());
  if (terms.length === 0 || query.length > MAX_QUERY) throw new ShelfToolError('invalid_query');

  const entries = await deps.listBooks();
  const paths = await Promise.all(entries
    .filter((entry) => entry.id !== currentBookId && entry.complete !== false)
    .map(async (entry) => {
      const record = await deps.readReadingRecord(entry.id);
      if (!record) return undefined;
      const path = await deps.loadPath(entry.id);
      return isFinished(entry, path, record) && path.nodes.some((node) => node.kind === 'recap')
        ? { entry, path } : undefined;
    }));

  const candidates = paths.flatMap((item) => item
    ? item.path.nodes.map((node) => {
      const haystack = `${item.entry.title} ${node.title} ${node.brief}`.toLocaleLowerCase();
      const score = terms.filter((term) => haystack.includes(term)).length;
      return { entry: item.entry, node, score };
    }).filter((candidate) => candidate.score > 0)
    : []);
  candidates.sort((a, b) => b.score - a.score);

  const selected = candidates.slice(0, MAX_STATIONS);
  const resultId = randomUUID();
  const refs: ShelfRef[] = selected.map(({ entry, node }) => ({
    bookId: entry.id, bookTitle: entry.title, nodeId: node.id, nodeTitle: node.title,
  }));
  const body = selected.map(({ entry, node }) =>
    `<station bookId="${escapeXml(entry.id)}" bookTitle="${boundedXml(entry.title, 80)}" nodeId="${escapeXml(node.id)}" title="${boundedXml(node.title, 80)}"><brief>${boundedXml(node.brief, 500)}</brief></station>`,
  ).join('');
  return {
    resultId,
    text: `<tool_result id="${resultId}" source="shelf">${body}</tool_result>`,
    evidence: { resultId, source: 'shelf', refs },
  };
}

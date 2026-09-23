import type { Path } from '../types';
import type { LibraryEntry } from './library';
import { normalizeEntry } from './library';

export interface ReadingRecord {
  readonly pathGeneratedAt: string;
  readonly finishedAt: string;
}

export function finishReading(
  entry: LibraryEntry,
  path: Path,
  nodeId: string,
  finishedAt: string,
): ReadingRecord | undefined {
  if (!normalizeEntry(entry).complete || entry.id !== path.bookId) return undefined;
  if (!path.nodes.some((node) => node.id === nodeId && node.kind === 'recap')) return undefined;
  return { pathGeneratedAt: path.generatedAt, finishedAt };
}

export function isFinished(
  entry: LibraryEntry,
  path: Path,
  record: ReadingRecord | undefined,
): boolean {
  return normalizeEntry(entry).complete && entry.id === path.bookId
    && record?.pathGeneratedAt === path.generatedAt;
}

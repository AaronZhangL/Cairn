/**
 * Several Markdown notes walked as one path. Each note keeps its sections
 * together under its own name, in natural file-name order, so "2 …" comes
 * before "10 …" the way the reader numbered them.
 */
import { type ParsedBook, ParseError } from '../types';
import { chunkBlocks } from './chunk';
import { localeFromText } from './language';
import { markdownBlocks, parseMarkdown } from './markdown';
import { decodeBytes } from './text';
import { promptsFor } from '../pipeline/prompts';

export interface NoteFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export function parseNotes(files: readonly NoteFile[]): ParsedBook {
  const notes = [...files]
    .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }))
    .map((f) => ({ path: f.path, raw: decodeBytes(f.bytes) }))
    .filter((n) => n.raw.trim().length > 0);

  if (notes.length === 0) throw new ParseError('笔记没有可读文本', 'no_content');
  const only = notes.length === 1 ? notes[0] : undefined;
  if (only) return parseMarkdown(new TextEncoder().encode(only.raw), baseName(only.path));

  const language = localeFromText(notes.map((n) => n.raw).join('\n').slice(0, 4000));
  const blocks = notes.flatMap((n) => {
    const name = baseName(n.path).replace(/\.[^.]+$/, '');
    return [...markdownBlocks(n.raw, name, name).blocks];
  });
  const chapters = chunkBlocks(blocks, { minWords: 1, merge: false });
  if (chapters.length === 0) throw new ParseError('笔记没有可读文本', 'no_content');

  return {
    title: sharedFolder(notes.map((n) => n.path)) ?? promptsFor(language).parse.notes(notes.length),
    format: 'markdown',
    kind: 'notes',
    chapters,
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    language,
  };
}

function sharedFolder(paths: readonly string[]): string | undefined {
  const parents = new Set(paths.map((p) => p.split(/[/\\]/).slice(0, -1).join('/')));
  const [only] = parents;
  return parents.size === 1 && only ? baseName(only) || undefined : undefined;
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

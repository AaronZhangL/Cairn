import type { ParsedBook } from '../types';
import { parseEpub } from './epub';
import { detectFormat } from './format';
import { parseMarkdown } from './markdown';
import { parseTxt } from './txt';

/** Dispatch by extension. All parsing happens locally; the file is never uploaded. */
export async function parseBook(bytes: Uint8Array, fileName: string): Promise<ParsedBook> {
  switch (detectFormat(fileName)) {
    case 'epub':
      return parseEpub(bytes, fileName);
    case 'txt':
      return parseTxt(bytes, fileName);
    case 'markdown':
      return parseMarkdown(bytes, fileName);
  }
}

export { ACCEPTED_EXTENSIONS, detectFormat } from './format';
export { parseEpub, parseMarkdown, parseTxt };
export * from '../types';

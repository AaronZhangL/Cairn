import { type BookFormat, type ParsedBook, ParseError } from '../types';
import { parseEpub } from './epub';
import { parseMarkdown } from './markdown';
import { parseTxt } from './txt';

/** Extensions the upload entry accepts. PDF is explicitly out of scope for v0. */
const FORMATS: Readonly<Record<string, BookFormat>> = {
  epub: 'epub',
  txt: 'txt',
  md: 'markdown',
  markdown: 'markdown',
};

export const ACCEPTED_EXTENSIONS = Object.keys(FORMATS).map((e) => `.${e}`);

export function detectFormat(fileName: string): BookFormat {
  const ext = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';
  const format = FORMATS[ext];
  if (!format) {
    throw new ParseError(
      `暂不支持 .${ext || '未知'} 格式，可上传 ${ACCEPTED_EXTENSIONS.join(' / ')}`,
      'unsupported_format',
      { ext, accepted: ACCEPTED_EXTENSIONS.join(' / ') },
    );
  }
  return format;
}

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

export { parseEpub, parseMarkdown, parseTxt };
export * from '../types';

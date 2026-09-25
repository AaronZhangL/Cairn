/**
 * Which files a book can come from. Apart from the parsers on purpose: the
 * webview shows this list, and importing it through `parse/index` shipped the
 * EPUB reader's zip library into the renderer bundle.
 */
import { type BookFormat, ParseError } from '../types';

const FORMATS: Readonly<Record<string, BookFormat>> = {
  epub: 'epub',
  txt: 'txt',
  md: 'markdown',
  markdown: 'markdown',
  pdf: 'pdf',
  mobi: 'mobi',
  azw: 'mobi',
  azw3: 'mobi',
  docx: 'docx',
};

export const ACCEPTED_EXTENSIONS = Object.keys(FORMATS).map((e) => `.${e}`);

/** What the reader is told is accepted: the common book formats, not every extension the picker allows. */
export const FEATURED_FORMATS = 'EPUB / PDF / MOBI / AZW3 / TXT';

export function detectFormat(fileName: string): BookFormat {
  const ext = fileName.toLowerCase().match(/\.([^.]+)$/)?.[1] ?? '';
  const format = FORMATS[ext];
  if (!format) {
    throw new ParseError(
      `暂不支持 .${ext || '未知'} 格式，可上传 ${FEATURED_FORMATS}`,
      'unsupported_format',
      { ext, accepted: FEATURED_FORMATS },
    );
  }
  return format;
}

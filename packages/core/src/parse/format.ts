/**
 * Which files a book can come from. Apart from the parsers on purpose: the
 * webview shows this list, and importing it through `parse/index` shipped the
 * EPUB reader's zip library into the renderer bundle.
 */
import { type BookFormat, ParseError } from '../types';

/** PDF is explicitly out of scope. */
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

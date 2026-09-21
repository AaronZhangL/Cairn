import { type Chapter, type ParsedBook, ParseError } from '../types';
import { countWords, decodeBytes, normalizeText } from './text';

const CN_NUM = '[零〇一二三四五六七八九十百千万两]';

/** A chapter heading must own its line and stay under 40 chars, so a "Chapter One" mentioned in prose isn't mistaken for one. */
const HEADING = new RegExp(
  '^[ \\t]*(' +
    `第\\s*(?:[0-9]+|${CN_NUM}+)\\s*[章节回卷部篇集](?:[ \\t\\u3000]*[^\\n]{0,40})?` +
    '|(?:楔子|序章|序言|引子|尾声|后记|番外|终章)(?:[ \\t\\u3000]*[^\\n]{0,40})?' +
    '|Chapter\\s+[0-9IVXLCivxlc]+(?:[ \\t]*[^\\n]{0,60})?' +
  ')[ \\t]*$',
  'gm',
);

/** Fallback split size (words) when no headings exist. Better over-split than hand the pipeline one huge block. */
const FALLBACK_CHUNK_WORDS = 3000;

export function parseTxt(bytes: Uint8Array, fileName: string): ParsedBook {
  if (bytes.byteLength === 0) throw new ParseError('文件为空', 'empty_file');

  const text = normalizeText(decodeBytes(bytes));
  if (text.length === 0) throw new ParseError('文件没有可读文本', 'no_content');

  const chapters = splitByHeading(text) ?? splitBySize(text);
  if (chapters.length === 0) throw new ParseError('未能切分出任何章节', 'no_content');

  return {
    title: stripExtension(fileName),
    format: 'txt',
    chapters,
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
  };
}

/** Returns null when no headings are found, deferring to the size-based fallback. */
function splitByHeading(text: string): readonly Chapter[] | null {
  const marks = [...text.matchAll(HEADING)].filter((m) => m.index !== undefined);
  if (marks.length < 2) return null;

  const chapters: Chapter[] = [];
  const preface = text.slice(0, marks[0]!.index!).trim();
  if (countWords(preface) > 0) chapters.push(makeChapter(chapters.length, '开篇', preface));

  marks.forEach((mark, i) => {
    const start = mark.index!;
    const end = i + 1 < marks.length ? marks[i + 1]!.index! : text.length;
    const title = mark[0].trim();
    const body = text.slice(start + mark[0].length, end).trim();
    if (countWords(body) > 0) chapters.push(makeChapter(chapters.length, title, body));
  });

  return chapters;
}

function splitBySize(text: string): readonly Chapter[] {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0);
  const chapters: Chapter[] = [];
  let buffer: string[] = [];
  let words = 0;

  const flush = (): void => {
    if (buffer.length === 0) return;
    chapters.push(makeChapter(chapters.length, `第 ${chapters.length + 1} 部分`, buffer.join('\n\n')));
    buffer = [];
    words = 0;
  };

  for (const p of paragraphs) {
    buffer.push(p);
    words += countWords(p);
    if (words >= FALLBACK_CHUNK_WORDS) flush();
  }
  flush();
  return chapters;
}

function makeChapter(idx: number, title: string, text: string): Chapter {
  return { idx, title, text, wordCount: countWords(text) };
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || fileName;
}

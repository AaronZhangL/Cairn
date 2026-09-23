import { type Chapter, type ParsedBook, ParseError } from '../types';
import { countWords, decodeBytes, normalizeText } from './text';
import { localeFromText } from './language';
import { promptsFor } from '../pipeline/prompts';

/** H1 is the book title and H2 the chapters; with no H2, H1 becomes the chapters. */
const H1 = /^#[ \t]+([^\n]+)$/m;
const HEADING = /^(#{1,2})[ \t]+([^\n]+)$/gm;

export function parseMarkdown(bytes: Uint8Array, fileName: string): ParsedBook {
  if (bytes.byteLength === 0) throw new ParseError('文件为空', 'empty_file');

  const text = normalizeText(decodeBytes(bytes));
  if (text.length === 0) throw new ParseError('文件没有可读文本', 'no_content');

  // Detected before splitting: the fallback chapter title has to be in the
  // book's own language, and splitting is what decides whether one is needed.
  const language = localeFromText(text.slice(0, 4000));

  const marks = [...text.matchAll(HEADING)].filter((m) => m.index !== undefined);
  const hasH2 = marks.some((m) => m[1] === '##');
  const level = hasH2 ? '##' : '#';
  const sections = marks.filter((m) => m[1] === level);

  const chapters: Chapter[] =
    sections.length > 0 ? cutSections(text, sections) : [singleChapter(text, promptsFor(language).parse.whole)];

  if (chapters.length === 0) throw new ParseError('未能切分出任何章节', 'no_content');

  return {
    title: text.match(H1)?.[1]?.trim() ?? stripExtension(fileName),
    format: 'markdown',
    chapters,
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    language,
  };
}

function cutSections(text: string, sections: readonly RegExpMatchArray[]): Chapter[] {
  const chapters: Chapter[] = [];
  sections.forEach((mark, i) => {
    const start = mark.index! + mark[0].length;
    const end = i + 1 < sections.length ? sections[i + 1]!.index! : text.length;
    const body = text.slice(start, end).trim();
    if (countWords(body) > 0) {
      chapters.push({
        idx: chapters.length,
        title: mark[2]!.trim(),
        text: body,
        wordCount: countWords(body),
      });
    }
  });
  return chapters;
}

function singleChapter(text: string, whole: string): Chapter {
  return { idx: 0, title: whole, text, wordCount: countWords(text) };
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || fileName;
}

import type { Chapter } from '../types';
import type { Block } from './chunk';
import type { ContentLocale } from './language';
import { htmlToText } from './text';
import { promptsFor } from '../pipeline/prompts';

/** Heading tags supply the chapter name and mark where to sub-split an HTML document. */
const HEADING_TAG = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

/**
 * A real EPUB spine item (or MOBI file) is often a whole chapter running to tens of thousands
 * of words. Split it at h1-h3 into sections; each takes its nearest heading as a
 * title, and the heading itself no longer appears in the body.
 */
export function splitByHeading(html: string): readonly Block[] {
  const marks = [...html.matchAll(HEADING_TAG)];
  if (marks.length === 0) {
    const text = htmlToText(html);
    // Left blank on purpose: the language is not known until the whole book
    // has been read, and `nameUntitled` fills these in once it is.
    return text.length > 0 ? [{ title: '', text }] : [];
  }

  // The first heading is this spine item's chapter name, used as the merge group
  const group = cleanTitle(marks[0]![2]!);
  const blocks: Block[] = [];

  const lead = htmlToText(html.slice(0, marks[0]!.index!));
  if (lead.length > 0) blocks.push({ title: group, text: lead, group });

  marks.forEach((mark, i) => {
    const start = mark.index! + mark[0].length;
    const end = i + 1 < marks.length ? marks[i + 1]!.index! : html.length;
    const text = htmlToText(html.slice(start, end));
    if (text.length > 0) blocks.push({ title: cleanTitle(mark[2]!), text, group });
  });

  return blocks;
}

function cleanTitle(rawHeading: string): string {
  const title = htmlToText(rawHeading).replace(/\s+/g, ' ').trim();
  return title.length > 0 && title.length <= 60 ? title : '';
}

/**
 * Fill in the titles that parsing could not read.
 *
 * Done here rather than where the blanks are made, because a title has to be in
 * the book's language and the language is only known once the text has been
 * read — which is after every section already has, or lacks, a heading.
 */
export function nameUntitled(
  chapters: readonly Chapter[],
  locale: ContentLocale,
): readonly Chapter[] {
  const { parse } = promptsFor(locale);
  let seq = 0;
  return chapters.map((c) => {
    if (c.title.length > 0) return c;
    seq += 1;
    return { ...c, title: parse.section(seq) };
  });
}

/**
 * A whole document in one HTML string, cut before each of its top-level headings
 * so every chapter becomes its own group, the way an EPUB spine item is one.
 */
export function splitAtTopHeadings(html: string): readonly string[] {
  const level = [1, 2, 3].find((n) => new RegExp(`<h${n}\\b`, 'i').test(html));
  return level === undefined ? [html] : html.split(new RegExp(`(?=<h${level}\\b)`, 'i'));
}

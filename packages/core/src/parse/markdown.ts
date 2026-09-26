/**
 * Markdown, which in Cairn means the reader's own notes. A lone first H1 is the
 * document's title; any other H1 opens a group and H2 the sections within it.
 * Every section is kept however short: a note is never a copyright page.
 */
import { type ParsedBook, ParseError } from '../types';
import { type Block, chunkBlocks } from './chunk';
import { localeFromText } from './language';
import { decodeBytes, normalizeText } from './text';
import { promptsFor } from '../pipeline/prompts';

export interface MarkdownDoc {
  /** From front matter, or a lone first H1. */
  readonly title: string | undefined;
  readonly blocks: readonly Block[];
}

const FRONT_MATTER = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,2})[ \t]+(.+?)[ \t#]*$/;

export function parseMarkdown(bytes: Uint8Array, fileName: string): ParsedBook {
  if (bytes.byteLength === 0) throw new ParseError('文件为空', 'empty_file');

  const raw = decodeBytes(bytes);
  // Detected before splitting: text before any heading is titled in the book's own language.
  const language = localeFromText(normalizeText(raw).slice(0, 4000));
  const doc = markdownBlocks(raw, promptsFor(language).parse.whole);
  const chapters = chunkBlocks(doc.blocks, { minWords: 1, merge: false });
  if (chapters.length === 0) throw new ParseError('文件没有可读文本', 'no_content');

  return {
    title: doc.title ?? stripExtension(fileName),
    format: 'markdown',
    kind: 'notes',
    chapters,
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    language,
  };
}

/**
 * One document's sections. `untitled` names text before the first heading.
 * `noteName`, given when several notes make one path, makes the note's own
 * title (or this name, lacking one) the group all its sections belong to.
 */
export function markdownBlocks(raw: string, untitled: string, noteName?: string): MarkdownDoc {
  const front = raw.match(FRONT_MATTER);
  const lines = cleanSyntax(front ? raw.slice(front[0].length) : raw).split(/\r?\n/);
  const headings = findHeadings(lines);
  const h1s = headings.filter((h) => h.level === 1);
  const titleLine = h1s.length === 1 && headings[0]?.level === 1 ? headings[0].line : undefined;
  const title = yamlTitle(front?.[1]) ?? (titleLine === undefined ? undefined : headings[0]?.text);
  const note = noteName === undefined ? undefined : (title ?? noteName);

  const blocks: Block[] = [];
  let current = { title: title ?? note ?? untitled, group: note, start: 0 };
  const close = (end: number): void => {
    const text = normalizeText(lines.slice(current.start, end).join('\n'));
    if (text.length > 0) blocks.push({ title: current.title, group: current.group, text });
  };

  for (const h of headings) {
    close(h.line);
    const group = h.level === 1 && h.line !== titleLine ? (note ?? h.text) : current.group;
    current = { title: h.text, group, start: h.line + 1 };
  }
  close(lines.length);
  return { title, blocks };
}

function findHeadings(lines: readonly string[]): readonly { level: 1 | 2; text: string; line: number }[] {
  const headings: { level: 1 | 2; text: string; line: number }[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (FENCE.test(line)) fenced = !fenced;
    const match = fenced ? null : line.match(HEADING);
    if (match) headings.push({ level: match[1] === '#' ? 1 : 2, text: match[2]!.trim(), line: i });
  });
  return headings;
}

/** Links keep their words; embeds, images and comments carry none a listener could use. */
function cleanSyntax(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
    .replace(/\[\[([^\]]*)\]\]/g, (_, target: string) => target.split('#')[0]!.split('/').pop() ?? target)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function yamlTitle(yaml: string | undefined): string | undefined {
  const value = yaml?.match(/^title:[ \t]*(.+)$/m)?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  return value && value.length > 0 ? value : undefined;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || fileName;
}

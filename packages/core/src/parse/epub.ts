import JSZip from 'jszip';
import { type Chapter, type ParsedBook, ParseError } from '../types';
import { type Block, chunkBlocks } from './chunk';
import { decodeEntities, htmlToText } from './text';

const CONTAINER_PATH = 'META-INF/container.xml';

/** Heading tags supply the chapter name and mark where to sub-split a spine item. */
const HEADING_TAG = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi;

export async function parseEpub(bytes: Uint8Array, fileName: string): Promise<ParsedBook> {
  if (bytes.byteLength === 0) throw new ParseError('文件为空', 'empty_file');

  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new ParseError('EPUB 压缩包损坏或不是有效的 EPUB', 'corrupt_archive');
  });

  const opfPath = await findOpfPath(zip);
  const opfXml = await readText(zip, opfPath);
  const baseDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const manifest = parseManifest(opfXml);
  const spine = parseSpine(opfXml);
  const chapters = await readChapters(zip, spine, manifest, baseDir);

  if (chapters.length === 0) throw new ParseError('EPUB 中没有可读正文', 'no_content');

  return {
    title: pickMeta(opfXml, 'title') ?? stripExtension(fileName),
    author: pickMeta(opfXml, 'creator'),
    format: 'epub',
    chapters,
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
  };
}

async function readText(zip: JSZip, path: string): Promise<string> {
  const file = zip.file(path);
  if (!file) throw new ParseError(`EPUB 内缺少 ${path}`, 'corrupt_archive');
  return file.async('string');
}

async function findOpfPath(zip: JSZip): Promise<string> {
  const container = zip.file(CONTAINER_PATH);
  if (container) {
    const path = (await container.async('string')).match(
      /<rootfile[^>]*full-path\s*=\s*["']([^"']+)["']/i,
    )?.[1];
    if (path) return path;
  }
  // A few EPUBs ship without container.xml; fall back to any .opf in the archive
  const fallback = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith('.opf'));
  if (!fallback) throw new ParseError('EPUB 缺少 OPF 清单，无法解析', 'corrupt_archive');
  return fallback;
}

/** id -> href. Hrefs are relative to the directory holding the OPF. */
function parseManifest(opfXml: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const item of opfXml.matchAll(/<item\b[^>]*>/gi)) {
    const tag = item[0];
    const id = attr(tag, 'id');
    const href = attr(tag, 'href');
    const type = attr(tag, 'media-type') ?? '';
    if (id && href && /xhtml|html|xml/i.test(type)) entries.set(id, decodeEntities(href));
  }
  return entries;
}

/** The spine sets reading order; the manifest is only a resource table. Order must come from the spine. */
function parseSpine(opfXml: string): readonly string[] {
  const spineXml = opfXml.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/i)?.[1] ?? '';
  return [...spineXml.matchAll(/<itemref\b[^>]*>/gi)]
    .filter((m) => attr(m[0], 'linear') !== 'no')
    .map((m) => attr(m[0], 'idref'))
    .filter((id): id is string => Boolean(id));
}

async function readChapters(
  zip: JSZip,
  spine: readonly string[],
  manifest: ReadonlyMap<string, string>,
  baseDir: string,
): Promise<readonly Chapter[]> {
  const blocks: Block[] = [];

  for (const idref of spine) {
    const href = manifest.get(idref);
    if (!href) continue;

    const file = zip.file(resolvePath(baseDir, href));
    if (!file) continue;

    blocks.push(...splitByHeading(await file.async('string'), blocks.length));
  }

  return chunkBlocks(blocks);
}

/**
 * A real EPUB spine item is often a whole chapter running to tens of thousands
 * of words. Split it at h1-h3 into sections; each takes its nearest heading as a
 * title, and the heading itself no longer appears in the body.
 */
function splitByHeading(html: string, seq: number): readonly Block[] {
  const marks = [...html.matchAll(HEADING_TAG)];
  if (marks.length === 0) {
    const text = htmlToText(html);
    return text.length > 0 ? [{ title: `第 ${seq + 1} 节`, text }] : [];
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
  return title.length > 0 && title.length <= 60 ? title : '（无题）';
}

/** Resolve ../ and ./ in a relative href, which EPUBs use freely. */
function resolvePath(baseDir: string, href: string): string {
  const clean = href.split('#')[0] ?? href;
  const segments: string[] = [];
  for (const part of `${baseDir}${clean}`.split('/')) {
    if (part === '..') segments.pop();
    else if (part !== '.' && part !== '') segments.push(part);
  }
  return segments.join('/');
}

function pickMeta(opfXml: string, tag: 'title' | 'creator'): string | undefined {
  const raw = opfXml.match(new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'))?.[1];
  const value = raw ? decodeEntities(raw).trim() : '';
  return value.length > 0 ? value : undefined;
}

function attr(tag: string, name: string): string | undefined {
  return tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || fileName;
}

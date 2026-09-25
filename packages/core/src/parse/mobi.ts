/**
 * Kindle books without DRM: MOBI, AZW and AZW3 (KF8). A combined file carries
 * both an old MOBI body and a KF8 one; the KF8 half is read when present, since
 * it is the one converted from the publisher's EPUB and keeps its headings.
 */
import { type ParsedBook, ParseError } from '../types';
import { type Block, chunkBlocks } from './chunk';
import { nameUntitled, splitByHeading } from './html-blocks';
import { detectContentLocale } from './language';
import { EXTH, exthUint, MobiFormatError, type MobiHeader, readHeader, readRecords, readText } from './mobi-decode';
import { decodeEntities } from './text';

/** A MOBI body marks chapter breaks this way; KF8 keeps one HTML document per source file instead. */
const PAGEBREAK = /<\s*(?:mbp:)?pagebreak[^>]*>/gi;
const KF8_FILE = /(?=<\?xml\b|<html\b)/i;

export function parseMobi(bytes: Uint8Array, fileName: string): ParsedBook {
  if (bytes.byteLength === 0) throw new ParseError('文件为空', 'empty_file');

  const { header, html } = readBook(bytes);
  const pieces = header.version >= 8 ? html.split(KF8_FILE) : html.split(PAGEBREAK);
  const blocks: Block[] = pieces.flatMap((piece) => [...splitByHeading(piece)]);
  const chapters = chunkBlocks(blocks);
  if (chapters.length === 0) throw new ParseError('Kindle 文件中没有可读正文', 'no_content');

  const decoder = new TextDecoder(header.encoding);
  const text = (type: number): string | undefined => {
    const values = header.exth.get(type)?.map((v) => decodeEntities(decoder.decode(v)).trim()).filter(Boolean);
    return values && values.length > 0 ? values.join(', ') : undefined;
  };
  const fullName = decodeEntities(decoder.decode(header.title)).trim();
  const sample = chapters.slice(0, 3).map((c) => c.text).join('\n').slice(0, 4000);
  const language = detectContentLocale(text(EXTH.language), sample);

  return {
    title: text(EXTH.title) ?? (fullName || stripExtension(fileName)),
    author: text(EXTH.creator),
    format: 'mobi',
    chapters: nameUntitled(chapters, language),
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    language,
  };
}

function readBook(bytes: Uint8Array): { header: MobiHeader; html: string } {
  try {
    const records = readRecords(bytes);
    const first = readHeader(records[0] ?? new Uint8Array());
    if (first.encryption !== 0) throw new ParseError('Kindle 文件带有 DRM', 'drm_protected');

    const kf8 = first.version < 8 ? kf8Half(records, first) : undefined;
    const { header, start } = kf8 ?? { header: first, start: 0 };
    if (header.encryption !== 0) throw new ParseError('Kindle 文件带有 DRM', 'drm_protected');

    return { header, html: new TextDecoder(header.encoding).decode(readText(records, start, header)) };
  } catch (cause) {
    if (cause instanceof ParseError) throw cause;
    if (cause instanceof MobiFormatError || cause instanceof RangeError) {
      throw new ParseError(`Kindle 文件损坏：${cause.message}`, 'corrupt_archive');
    }
    throw cause;
  }
}

/** A boundary that points at no readable header leaves the MOBI body, which is still the whole book. */
function kf8Half(records: readonly Uint8Array[], first: MobiHeader): { header: MobiHeader; start: number } | undefined {
  const start = exthUint(first, EXTH.boundary);
  const record = start === undefined ? undefined : records[start];
  if (start === undefined || !record) return undefined;
  try {
    return { header: readHeader(record), start };
  } catch (cause) {
    if (cause instanceof MobiFormatError) return undefined;
    throw cause;
  }
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || fileName;
}

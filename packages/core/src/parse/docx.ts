/**
 * Word documents, converted by mammoth: its style map turns Word's heading
 * styles into h1-h3, and from there a DOCX is split like an EPUB. A document
 * with no heading styles is split the way a TXT is.
 */
import JSZip from 'jszip';
import mammoth from 'mammoth';
import { type ParsedBook, ParseError } from '../types';
import { chunkBlocks } from './chunk';
import { nameUntitled, splitAtTopHeadings, splitByHeading } from './html-blocks';
import { localeFromText } from './language';
import { decodeEntities, htmlToText } from './text';
import { splitPlainText } from './txt';
import { promptsFor } from '../pipeline/prompts';

export async function parseDocx(bytes: Uint8Array, fileName: string): Promise<ParsedBook> {
  if (bytes.byteLength === 0) throw new ParseError('文件为空', 'empty_file');

  const zip = await JSZip.loadAsync(bytes).catch(() => {
    throw new ParseError('DOCX 压缩包损坏或不是有效的 DOCX', 'corrupt_archive');
  });
  const html = await toHtml(bytes);
  const text = htmlToText(html);
  if (text.length === 0) throw new ParseError('DOCX 中没有可读正文', 'no_content');

  const language = localeFromText(text.slice(0, 4000));
  const chapters = /<h[1-3]\b/i.test(html)
    ? nameUntitled(chunkBlocks(splitAtTopHeadings(html).flatMap((piece) => [...splitByHeading(piece)])), language)
    : splitPlainText(text, promptsFor(language).parse);
  if (chapters.length === 0) throw new ParseError('未能切分出任何章节', 'no_content');

  // mammoth reads the body only; title and author live in the package's core properties
  const core = (await zip.file('docProps/core.xml')?.async('string')) ?? '';
  return {
    title: pickCore(core, 'dc:title') ?? stripExtension(fileName),
    author: pickCore(core, 'dc:creator'),
    format: 'docx',
    chapters,
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    language,
  };
}

async function toHtml(bytes: Uint8Array): Promise<string> {
  try {
    const result = await mammoth.convertToHtml(
      { buffer: Buffer.from(bytes) },
      // Images would be inlined as base64 only to be stripped again
      { convertImage: mammoth.images.imgElement(async () => ({ src: '' })) },
    );
    return result.value;
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ParseError(`DOCX 无法读取：${reason}`, 'corrupt_archive');
  }
}

function pickCore(coreXml: string, tag: string): string | undefined {
  const raw = coreXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1];
  const value = raw ? decodeEntities(raw).trim() : '';
  return value.length > 0 ? value : undefined;
}

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[^./\\]+$/, '') || fileName;
}

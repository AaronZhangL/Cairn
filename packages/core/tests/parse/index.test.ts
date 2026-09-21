import { describe, expect, test } from 'bun:test';
import { ACCEPTED_EXTENSIONS, detectFormat, parseBook } from '../../src/parse/index';
import { ParseError } from '../../src/types';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('detectFormat', () => {
  test.each([
    ['book.epub', 'epub'],
    ['book.txt', 'txt'],
    ['book.md', 'markdown'],
    ['book.markdown', 'markdown'],
    ['BOOK.EPUB', 'epub'],
  ])('%s → %s', (name, expected) => {
    expect(detectFormat(name)).toBe(expected as never);
  });

  test('PDF 明确不支持，错误信息列出可用格式', () => {
    try {
      detectFormat('book.pdf');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ParseError).code).toBe('unsupported_format');
      expect((e as ParseError).message).toContain('.epub');
    }
  });

  test('无扩展名抛 unsupported_format', () => {
    expect(() => detectFormat('book')).toThrow(ParseError);
  });

  test('ACCEPTED_EXTENSIONS 不含 pdf', () => {
    expect(ACCEPTED_EXTENSIONS).not.toContain('.pdf');
  });
});

describe('parseBook 分发', () => {
  test('txt 走 txt 解析', async () => {
    const book = await parseBook(enc('第一章 甲\n\n一。\n\n第二章 乙\n\n二。'), 'a.txt');
    expect(book.format).toBe('txt');
    expect(book.chapters).toHaveLength(2);
  });

  test('md 走 markdown 解析', async () => {
    const book = await parseBook(enc('# 书\n\n## 甲\n\n正文。'), 'a.md');
    expect(book.format).toBe('markdown');
  });
});

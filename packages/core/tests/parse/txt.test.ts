import { describe, expect, test } from 'bun:test';
import { ParseError } from '../../src/types';
import { parseTxt } from '../../src/parse/txt';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('parseTxt 章节切分', () => {
  test('按「第 N 章」切分并保留标题', () => {
    const book = parseTxt(enc('第一章 觉醒\n\n正文甲。\n\n第二章 试炼\n\n正文乙。'), '凡人.txt');
    expect(book.chapters.map((c) => c.title)).toEqual(['第一章 觉醒', '第二章 试炼']);
    expect(book.chapters[0]!.text).toBe('正文甲。');
  });

  test('阿拉伯数字章号同样识别', () => {
    const book = parseTxt(enc('第1章 甲\n\n一。\n\n第2章 乙\n\n二。'), 'a.txt');
    expect(book.chapters).toHaveLength(2);
  });

  test('楔子与序章作为章节', () => {
    const book = parseTxt(enc('楔子\n\n起。\n\n第一章 甲\n\n承。'), 'a.txt');
    expect(book.chapters[0]!.title).toBe('楔子');
  });

  test('标题前的文字归入「开篇」', () => {
    const book = parseTxt(enc('出版说明。\n\n第一章 甲\n\n正文。\n\n第二章 乙\n\n正文。'), 'a.txt');
    expect(book.chapters[0]!.title).toBe('开篇');
    expect(book.chapters[0]!.text).toBe('出版说明。');
  });

  test('正文中出现的「第一章」不被误判为标题', () => {
    const src = '第一章 甲\n\n他翻到第一章 讲的是锚定效应，于是继续读。\n\n第二章 乙\n\n正文。';
    expect(parseTxt(enc(src), 'a.txt').chapters).toHaveLength(2);
  });

  test('Chapter N 英文标题', () => {
    const book = parseTxt(enc('Chapter 1 Anchors\n\nBody one.\n\nChapter 2 Drift\n\nBody two.'), 'a.txt');
    expect(book.chapters).toHaveLength(2);
  });
});

describe('parseTxt 兜底', () => {
  test('无章节标记时按体量切分，而不是返回一整块', () => {
    const para = `${'甲'.repeat(500)}\n\n`;
    const book = parseTxt(enc(para.repeat(20)), 'a.txt');
    expect(book.chapters.length).toBeGreaterThan(1);
  });

  test('只有一个标题时走兜底而非只切一章', () => {
    const book = parseTxt(enc('第一章 甲\n\n短正文。'), 'a.txt');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('第 1 部分');
  });
});

describe('parseTxt 边界', () => {
  test('空文件抛 empty_file', () => {
    expect(() => parseTxt(new Uint8Array(0), 'a.txt')).toThrow(ParseError);
  });
  test('纯空白抛 no_content', () => {
    try {
      parseTxt(enc('   \n\n  '), 'a.txt');
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as ParseError).code).toBe('no_content');
    }
  });
  test('书名取自文件名且去扩展名', () => {
    expect(parseTxt(enc('第一章 甲\n\n一。\n\n第二章 乙\n\n二。'), '凡人修仙传.txt').title)
      .toBe('凡人修仙传');
  });
  test('totalWords 等于各章之和', () => {
    const book = parseTxt(enc('第一章 甲\n\n一二三。\n\n第二章 乙\n\n四五。'), 'a.txt');
    expect(book.totalWords).toBe(book.chapters.reduce((s, c) => s + c.wordCount, 0));
  });
});

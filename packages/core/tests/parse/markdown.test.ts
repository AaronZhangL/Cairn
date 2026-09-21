import { describe, expect, test } from 'bun:test';
import { parseMarkdown } from '../../src/parse/markdown';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('parseMarkdown', () => {
  test('一级标题作书名，二级标题作章节', () => {
    const book = parseMarkdown(enc('# 思考，快与慢\n\n## 系统一\n\n甲。\n\n## 系统二\n\n乙。'), 'a.md');
    expect(book.title).toBe('思考，快与慢');
    expect(book.chapters.map((c) => c.title)).toEqual(['系统一', '系统二']);
  });

  test('无二级标题时一级标题即章节', () => {
    const book = parseMarkdown(enc('# 甲\n\n正文甲。\n\n# 乙\n\n正文乙。'), 'a.md');
    expect(book.chapters).toHaveLength(2);
  });

  test('无任何标题时全文作一章', () => {
    const book = parseMarkdown(enc('就是一段没有标题的正文。'), '笔记.md');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('全文');
    expect(book.title).toBe('笔记');
  });

  test('空章节被丢弃', () => {
    const book = parseMarkdown(enc('# 书\n\n## 空的\n\n## 有内容\n\n正文。'), 'a.md');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.title).toBe('有内容');
  });
});

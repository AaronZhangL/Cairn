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

describe('parseMarkdown 笔记写法', () => {
  test('一级标题与第一个二级标题之间的文字不丢', () => {
    const book = parseMarkdown(enc('# 概念\n\n这是概要。\n\n## 细节\n\n正文。'), 'a.md');
    expect(book.chapters.map((c) => c.text).join('\n')).toContain('这是概要。');
  });

  test('代码块里的 # 注释不是标题', () => {
    const src = '# 笔记\n\n正文。\n\n```python\n# 不是标题\nprint(1)\n```\n\n结尾。';
    const book = parseMarkdown(enc(src), 'a.md');
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0]!.text).toContain('# 不是标题');
  });

  test('YAML 头信息不进正文，其中的 title 作书名', () => {
    const book = parseMarkdown(enc('---\ntitle: 我的读书笔记\ntags: [a, b]\n---\n\n## 第一节\n\n正文。'), 'a.md');
    expect(book.title).toBe('我的读书笔记');
    expect(book.chapters[0]!.text).not.toContain('tags');
  });

  test('Obsidian 链接留下文字，嵌入的附件去掉', () => {
    const book = parseMarkdown(enc('见 [[锚定效应|锚定]] 和 [[系统一]]，还有 ![[图.png]] 与 [官网](https://x.org)。'), 'a.md');
    expect(book.chapters[0]!.text).toBe('见 锚定 和 系统一，还有 与 官网。');
  });

  test('没有小标题的长笔记按长度拆开', () => {
    const para = `${'锚定效应让人过度依赖最先得到的信息。'.repeat(40)}\n\n`;
    const book = parseMarkdown(enc(para.repeat(30)), 'a.md');
    expect(book.chapters.length).toBeGreaterThan(1);
    expect(Math.max(...book.chapters.map((c) => c.wordCount))).toBeLessThanOrEqual(6000);
  });

  test('很短的小节也保留，不像 EPUB 的版权页那样丢掉', () => {
    const book = parseMarkdown(enc('## 甲\n\n一句。\n\n## 乙\n\n两句。'), 'a.md');
    expect(book.chapters.map((c) => c.title)).toEqual(['甲', '乙']);
  });

  test('多个一级标题各自成组，二级标题归到所在的组下', () => {
    const book = parseMarkdown(enc('# 甲\n\n## 一\n\n正文。\n\n# 乙\n\n## 二\n\n正文。'), 'a.md');
    expect(book.chapters.map((c) => c.title)).toEqual(['甲 · 一', '乙 · 二']);
  });
});

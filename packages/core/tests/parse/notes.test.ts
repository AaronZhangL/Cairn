import { describe, expect, test } from 'bun:test';
import { ParseError } from '../../src/types';
import { parseNotes } from '../../src/parse/notes';

const note = (path: string, text: string) => ({ path, bytes: new TextEncoder().encode(text) });

describe('parseNotes', () => {
  test('notes are walked in natural file-name order, each under its own name', () => {
    const book = parseNotes([
      note('/n/10 复盘.md', '复盘的内容。'),
      note('/n/2 系统一.md', '系统一的内容。'),
      note('/n/1 锚定.md', '# 锚定效应\n\n概要。\n\n## 例子\n\n例子。'),
    ]);
    expect(book.chapters.map((c) => c.title)).toEqual(['锚定效应', '锚定效应 · 例子', '2 系统一', '10 复盘']);
    expect(book.kind).toBe('notes');
  });

  test('the shared folder names the path', () => {
    const book = parseNotes([note('/Users/me/读书笔记/a.md', '甲。'), note('/Users/me/读书笔记/b.md', '乙。')]);
    expect(book.title).toBe('读书笔记');
  });

  test('notes from different folders are counted instead, in their own language', () => {
    expect(parseNotes([note('/x/a.md', '甲的内容。'), note('/y/b.md', '乙的内容。')]).title).toBe('2 篇笔记');
    expect(parseNotes([note('/x/a.md', 'First note.'), note('/y/b.md', 'Second note.')]).title).toBe('2 notes');
  });

  test('one note is read as that note, titled by it', () => {
    const book = parseNotes([note('/n/a.md', '---\ntitle: 思考\n---\n\n## 一\n\n正文。')]);
    expect(book.title).toBe('思考');
    expect(book.chapters.map((c) => c.title)).toEqual(['一']);
  });

  test('an empty note is skipped; all empty is no content', () => {
    expect(parseNotes([note('/n/a.md', ''), note('/n/b.md', '乙。')]).chapters).toHaveLength(1);
    expect(() => parseNotes([note('/n/a.md', ''), note('/n/b.md', '  \n')])).toThrow(ParseError);
  });
});

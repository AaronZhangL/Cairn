import { describe, expect, test } from 'bun:test';
import { audioFile, bookDir, bookFile, bookSlug } from '../../src/store/library';

describe('library paths', () => {
  test('每本书一个目录，互不覆盖', () => {
    expect(bookDir('a')).not.toBe(bookDir('b'));
  });
  test('书内文件都在自己目录下', () => {
    expect(bookFile('pro-git', 'path.json')).toBe('books/pro-git/path.json');
    expect(audioFile('pro-git', 'n0')).toBe('books/pro-git/audio/n0.mp3');
  });
});

describe('bookSlug', () => {
  // Distinct hashes per input, as a real hash would give
  const hash = (s: string): string => `${[...s].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)}`;

  test('书名进入 slug，便于辨认', () => {
    expect(bookSlug('Pro Git', hash, '/a.epub')).toMatch(/^pro-git-/);
  });
  test('大小写与标点归一', () => {
    expect(bookSlug('Pro  Git!!', hash, '/a.epub')).toBe(bookSlug('Pro Git', hash, '/a.epub'));
  });
  test('同名但不同文件不会互相覆盖 —— 译本与原著可以共存', () => {
    expect(bookSlug('Pro Git', hash, '/zh.epub')).not.toBe(bookSlug('Pro Git', hash, '/en.epub'));
  });
  test('同一文件重新生成落在同一个 id', () => {
    expect(bookSlug('Pro Git', hash, '/a.epub')).toBe(bookSlug('Pro Git', hash, '/a.epub'));
  });
  test('中文书名仍然产出 ASCII 目录名', () => {
    const s = bookSlug('思考，快与慢', hash, '/a.epub');
    expect(s).toMatch(/^book-/);
    expect(s).toMatch(/^[\x20-\x7e]+$/);
  });
  test('过长书名被截断', () => {
    expect(bookSlug('a'.repeat(200), hash, '/a.epub').length).toBeLessThanOrEqual(40);
  });
});

import { beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ParseError } from '@cairn/core/types';
import { readBook, sourceOf } from '../../src/main/inspect';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cairn-inspect-'));
  await writeFile(join(dir, 'a.md'), '# 锚定\n\n锚定的笔记。');
  await writeFile(join(dir, 'b.md'), '# 系统一\n\n系统一的笔记。');
  await writeFile(join(dir, 'c.txt'), '第一章 甲\n\n一。\n\n第二章 乙\n\n二。');
});

describe('readBook', () => {
  test('several Markdown files are one path of notes', async () => {
    const book = await readBook([join(dir, 'b.md'), join(dir, 'a.md')]);
    expect(book.kind).toBe('notes');
    expect(book.chapters.map((c) => c.title)).toEqual(['锚定', '系统一']);
  });

  test('a single Markdown file is notes too', async () => {
    expect((await readBook([join(dir, 'a.md')])).kind).toBe('notes');
  });

  test('a book is still a book', async () => {
    expect((await readBook([join(dir, 'c.txt')])).kind).toBeUndefined();
  });

  test('a book among notes is refused by name', async () => {
    const error = await readBook([join(dir, 'a.md'), join(dir, 'c.txt')]).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ParseError);
    expect((error as ParseError).code).toBe('mixed_selection');
  });
});

test('the same notes picked in another order are the same path', () => {
  expect(sourceOf(['/n/b.md', '/n/a.md'])).toBe(sourceOf(['/n/a.md', '/n/b.md']));
});

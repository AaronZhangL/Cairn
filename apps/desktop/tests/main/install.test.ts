import { beforeEach, describe, expect, test } from 'bun:test';
import { readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Chapter, ChapterNote, NodeDeck, Path } from '@cairn/core/types';
import type { LibraryEntry } from '@cairn/core/store/library';

// The throwaway library `tests/setup.ts` created before any module loaded
const DIR = process.env.CAIRN_DATA_DIR!;

const {
  deleteBook, installDeck, installPath, listBooks, patchEntry, readDeckIndex, rewritePath,
} = await import('../../src/main/install');

const path = (nodeCount: number): Path => ({
  bookId: 'b1', title: '测试书', type: 'knowledge',
  nodes: Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`, idx: i, title: `第 ${i} 站`, kind: 'concept' as const,
    brief: '', keyPoints: [], sourceChapters: [0], estMinutes: 3,
  })),
  stages: [{ title: '阶段', nodeIds: Array.from({ length: nodeCount }, (_, i) => `n${i}`) }],
  totalMinutes: nodeCount * 3, generatedAt: '2026-01-01T00:00:00.000Z',
});

const notes: readonly ChapterNote[] = [{ idx: 0, title: '章', gist: 'g', keyPoints: [], quotes: [] }];
const chapters: readonly Chapter[] = [{ idx: 0, title: '章', text: '正文', wordCount: 2 }];

const entry = (over: Partial<LibraryEntry> = {}): LibraryEntry => ({
  id: 'b1', title: '测试书', stations: 3, minutes: 9,
  budgetId: 'brief', generatedAt: '2026-01-01T00:00:00.000Z',
  complete: false, built: 0, ...over,
});

const deck = (nodeId: string): NodeDeck => ({
  nodeId, slides: [], narration: [], audioPath: `/x/${nodeId}.mp3`, durationMs: 120_000,
});

/** installDeck copies the mp3 out of the build cache, so one has to exist. */
async function audioCache(nodeIds: readonly string[]): Promise<string> {
  const dir = join(DIR, 'cache-audio');
  await mkdir(dir, { recursive: true });
  for (const id of nodeIds) await writeFile(join(dir, `${id}.mp3`), 'fake-mp3');
  return dir;
}

beforeEach(async () => {
  await rm(join(DIR, 'books'), { recursive: true, force: true });
  await rm(join(DIR, 'books.json'), { force: true });
});

describe('installPath', () => {
  test('路径先落地——书在一站都没建好时就能打开', async () => {
    await installPath(path(3), notes, chapters, entry());

    const saved = JSON.parse(await readFile(join(DIR, 'books/b1/path.json'), 'utf8')) as Path;
    expect(saved.nodes).toHaveLength(3);
    expect(await readDeckIndex('b1')).toMatchObject({ total: 3, ready: [], complete: false });
  });

  test('问答要用的原文和摘要一并落地', async () => {
    await installPath(path(1), notes, chapters, entry());
    expect(JSON.parse(await readFile(join(DIR, 'books/b1/notes.json'), 'utf8'))).toHaveLength(1);
    expect(JSON.parse(await readFile(join(DIR, 'books/b1/chapters.json'), 'utf8'))).toHaveLength(1);
  });

  test('索引里记成未完成，而不是假装建好了', async () => {
    await installPath(path(3), notes, chapters, entry());
    const [book] = await listBooks();
    expect(book).toMatchObject({ complete: false, built: 0 });
  });

  test('重新生成时清掉旧的 deck，避免站数变少时留下孤儿', async () => {
    const audio = await audioCache(['n0', 'n1', 'n2']);
    await installPath(path(3), notes, chapters, entry());
    for (const id of ['n0', 'n1', 'n2']) await installDeck('b1', deck(id), audio);

    await installPath(path(1), notes, chapters, entry({ stations: 1 }));
    expect(await Bun.file(join(DIR, 'books/b1/decks/n2.json')).exists()).toBe(false);
    expect(await readDeckIndex('b1')).toMatchObject({ total: 1, ready: [] });
  });
});

describe('installDeck', () => {
  test('deck 与音频一起落地——列为就绪的站必须能播', async () => {
    const audio = await audioCache(['n0']);
    await installPath(path(2), notes, chapters, entry());
    await installDeck('b1', deck('n0'), audio);

    expect(await Bun.file(join(DIR, 'books/b1/decks/n0.json')).exists()).toBe(true);
    expect(await Bun.file(join(DIR, 'books/b1/audio/n0.mp3')).exists()).toBe(true);
  });

  /**
   * A generated book is meant to be movable — copied to another machine, or
   * synced to a phone that has no idea what `/Users/karen` means. An absolute
   * path baked into the deck survives neither, and the player never reads this
   * field anyway (it derives the URL from `audioFile(bookId, nodeId)`).
   */
  test('落盘的 deck 存的是相对路径，既不是构建缓存也不是绝对路径', async () => {
    const audio = await audioCache(['n0']);
    await installPath(path(1), notes, chapters, entry());
    await installDeck('b1', deck('n0'), audio);

    const saved = JSON.parse(
      await readFile(join(DIR, 'books/b1/decks/n0.json'), 'utf8'),
    ) as NodeDeck;
    expect(saved.audioPath).toBe('audio/n0.mp3');
    expect(saved.audioPath).not.toContain(DIR);
    expect(saved.audioPath).not.toContain('cache-audio');
    expect(saved.audioPath.startsWith('/')).toBe(false);
  });

  /**
   * The source is still found by its content-keyed name, not rebuilt from the
   * node id — that reconstruction is what once shipped one budget's audio under
   * another budget's subtitles (invariant 8). Storing a relative path must not
   * quietly undo it.
   */
  test('音频仍按内容键的文件名从缓存拷贝', async () => {
    const audio = await audioCache(['n0']);
    await installPath(path(1), notes, chapters, entry());
    await installDeck('b1', deck('n0'), audio);

    expect(await Bun.file(join(DIR, 'books/b1/audio/n0.mp3')).text())
      .toBe(await Bun.file(join(audio, 'n0.mp3')).text());
  });
});

describe('索引写入', () => {
  test('并发打补丁不会丢更新', async () => {
    await installPath(path(6), notes, chapters, entry());
    await Promise.all([
      patchEntry('b1', { built: 1 }),
      patchEntry('b1', { minutes: 42 }),
      patchEntry('b1', { complete: true }),
    ]);

    const [book] = await listBooks();
    expect(book).toMatchObject({ minutes: 42, complete: true });
  });

  test('给不存在的书打补丁返回 undefined，而不是凭空造一条', async () => {
    expect(await patchEntry('nope', { built: 1 })).toBeUndefined();
    expect(await listBooks()).toHaveLength(0);
  });

  test('老库里缺字段的条目被当作已完成', async () => {
    await writeFile(join(DIR, 'books.json'), JSON.stringify([{
      id: 'old', title: '旧书', stations: 5, minutes: 20,
      budgetId: 'brief', generatedAt: '2025-01-01T00:00:00.000Z',
    }]));
    expect((await listBooks())[0]).toMatchObject({ complete: true, built: 5 });
  });

  test('索引坏掉时返回空，而不是让整个书架崩掉', async () => {
    await writeFile(join(DIR, 'books.json'), '{ 不是 JSON');
    expect(await listBooks()).toEqual([]);
  });
});

describe('rewritePath', () => {
  test('实测时长覆盖模型的估计', async () => {
    await installPath(path(2), notes, chapters, entry());
    await rewritePath({ ...path(2), totalMinutes: 7 });
    const saved = JSON.parse(await readFile(join(DIR, 'books/b1/path.json'), 'utf8')) as Path;
    expect(saved.totalMinutes).toBe(7);
  });
});

describe('readDeckIndex', () => {
  test('没有清单时返回 undefined —— 老书没有这个文件', async () => {
    expect(await readDeckIndex('missing')).toBeUndefined();
  });
});

describe('deleteBook', () => {
  test('removes the entry and the whole book directory', async () => {
    await installPath(path(2), notes, chapters, entry());
    await installDeck('b1', deck('n0'), await audioCache(['n0']));
    expect(await listBooks()).toHaveLength(1);

    expect(await deleteBook('b1')).toBe(true);
    expect(await listBooks()).toHaveLength(0);
    expect(await readFile(join(DIR, 'books', 'b1', 'path.json'), 'utf8').catch(() => null))
      .toBeNull();
  });

  test('leaves the other books alone', async () => {
    await installPath(path(1), notes, chapters, entry());
    await installPath({ ...path(1), bookId: 'b2' }, notes, chapters, entry({ id: 'b2' }));

    await deleteBook('b1');
    expect((await listBooks()).map((b) => b.id)).toEqual(['b2']);
    expect(await readFile(join(DIR, 'books', 'b2', 'path.json'), 'utf8')).toContain('b2');
  });

  test('refuses a book that is not listed', async () => {
    expect(await deleteBook('never-added')).toBe(false);
  });

  /** The id crosses the RPC bridge and is joined onto the library root. */
  test('refuses an id that could leave the library directory', async () => {
    await installPath(path(1), notes, chapters, entry());
    expect(await deleteBook('../..')).toBe(false);
    expect(await listBooks()).toHaveLength(1);
  });
});

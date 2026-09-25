import { describe, expect, test } from 'bun:test';
import { chunkBlocks, MAX_WORDS, MIN_WORDS, TARGET_WORDS, type Block } from '../../src/parse/chunk';

const words = (n: number): string => '甲'.repeat(n);
const para = (n: number, chunks = 1): string =>
  Array.from({ length: chunks }, () => words(Math.floor(n / chunks))).join('\n\n');

describe('chunkBlocks 合并', () => {
  test('同组的小块合并，减少 map 调用次数', () => {
    const blocks: Block[] = [
      { title: '甲节', text: words(800), group: '第一章' },
      { title: '乙节', text: words(800), group: '第一章' },
    ];
    expect(chunkBlocks(blocks)).toHaveLength(1);
  });

  test('不同组之间绝不合并——否则章节归属会错乱', () => {
    const blocks: Block[] = [
      { title: '甲节', text: words(800), group: '第一章' },
      { title: '乙节', text: words(800), group: '第二章' },
    ];
    expect(chunkBlocks(blocks)).toHaveLength(2);
  });

  test('合并不超过 TARGET_WORDS', () => {
    const blocks: Block[] = Array.from({ length: 6 }, (_, i) => ({
      title: `第${i}节`, text: words(1200), group: '同一章',
    }));
    for (const c of chunkBlocks(blocks)) expect(c.wordCount).toBeLessThanOrEqual(TARGET_WORDS);
  });
});

describe('chunkBlocks 切分', () => {
  test('超大块被切开——真实 EPUB 一章可达数万字', () => {
    const huge: Block[] = [{ title: '巨章', text: para(MAX_WORDS * 3, 60), group: '卷一' }];
    const out = chunkBlocks(huge);
    expect(out.length).toBeGreaterThan(1);
    for (const c of out) expect(c.wordCount).toBeLessThan(MAX_WORDS);
  });

  test('切开后标题带分片序号', () => {
    const out = chunkBlocks([{ title: '巨章', text: para(MAX_WORDS * 3, 60) }]);
    expect(out[0]!.title).toMatch(/巨章（1\/\d+）/);
  });

  test('不从段落中间切断', () => {
    const out = chunkBlocks([{ title: '巨章', text: para(MAX_WORDS * 2, 40) }]);
    for (const c of out) expect(c.text.startsWith('甲')).toBe(true);
  });
});

describe('chunkBlocks 过滤', () => {
  test('低于 MIN_WORDS 的块被丢弃——版权页、献辞不值得一次 LLM 调用', () => {
    const blocks: Block[] = [
      { title: '献辞', text: words(MIN_WORDS - 50), group: '前言' },
      { title: '正文', text: words(2000), group: '第一章' },
    ];
    expect(chunkBlocks(blocks).map((c) => c.title)).toEqual(['第一章 · 正文']);
  });

  test('空块被忽略', () => {
    expect(chunkBlocks([{ title: '空', text: '   ' }])).toHaveLength(0);
  });
});

describe('chunkBlocks 标题', () => {
  test('小节标题冠以章名', () => {
    const out = chunkBlocks([{ title: '获取仓库', text: words(2000), group: 'Git 基础' }]);
    expect(out[0]!.title).toBe('Git 基础 · 获取仓库');
  });

  test('小节标题与章名相同时不重复', () => {
    const out = chunkBlocks([{ title: 'Git 基础', text: words(2000), group: 'Git 基础' }]);
    expect(out[0]!.title).toBe('Git 基础');
  });

  test('重名章节加序号——模型无法区分五个同名章节', () => {
    // 同组、各自超过 TARGET 故不合并，冠名后仍然同名 → 必须加序号
    const blocks: Block[] = Array.from({ length: 3 }, () => ({
      title: '同名', text: words(2500), group: '同名',
    }));
    expect(chunkBlocks(blocks).map((c) => c.title))
      .toEqual(['同名（1/3）', '同名（2/3）', '同名（3/3）']);
  });

  test('无标题的块保持空标题，留给调用方按书的语言命名', () => {
    const untitled: Block[] = [
      { title: '', text: words(2500) },
      { title: '', text: para(MAX_WORDS + 2000, 8) },
    ];
    expect(chunkBlocks(untitled).every((c) => c.title === '')).toBe(true);
  });

  test('无标题但有分组的块取分组名', () => {
    expect(chunkBlocks([{ title: '', text: words(2500), group: '第一章' }])[0]!.title).toBe('第一章');
  });
});

describe('chunkBlocks 索引', () => {
  test('idx 连续且从 0 开始', () => {
    const blocks: Block[] = Array.from({ length: 5 }, (_, i) => ({
      title: `第${i}章`, text: words(2500), group: `组${i}`,
    }));
    expect(chunkBlocks(blocks).map((c) => c.idx)).toEqual([0, 1, 2, 3, 4]);
  });
});

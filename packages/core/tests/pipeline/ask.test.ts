import { describe, expect, test } from 'bun:test';
import {
  askAnchored, askBook, type ChapterRef, excerptAround, noteIndexLocator, singleBook,
} from '../../src/pipeline/ask';
import type { LlmProvider, LlmRequest } from '../../src/llm/types';
import type { Chapter, ChapterNote, PathNode } from '../../src/types';

/** Records prompts so tests can assert what the model was actually shown. */
const stub = (reply: string | ((r: LlmRequest) => string)): LlmProvider & { seen: LlmRequest[] } => {
  const seen: LlmRequest[] = [];
  return {
    seen, name: 'stub', suggestedConcurrency: 1, overheadTokens: 0,
    async complete(request) {
      seen.push(request);
      return typeof reply === 'function' ? reply(request) : reply;
    },
  };
};

const chapter = (idx: number, text: string): Chapter =>
  ({ idx, title: `第${idx}章`, text, wordCount: text.length });

const node: PathNode = {
  id: 'n0', idx: 0, title: '三棵树', kind: 'concept',
  brief: '讲清工作区、暂存区与仓库的关系', keyPoints: [],
  sourceChapters: [5, 7], estMinutes: 3,
};

const notes: readonly ChapterNote[] = [
  { idx: 0, title: '起步', gist: '版本控制的由来', keyPoints: [], quotes: [] },
  { idx: 5, title: '三种状态', gist: '已修改、已暂存、已提交', keyPoints: [], quotes: [] },
  { idx: 44, title: 'reset 详解', gist: 'reset 的三种模式', keyPoints: [], quotes: [] },
];

describe('excerptAround', () => {
  test('围绕划线位置取窗口', () => {
    const text = `${'甲'.repeat(3000)}锚定效应${'乙'.repeat(3000)}`;
    const out = excerptAround(text, '锚定效应');
    expect(out).toContain('锚定效应');
    expect(out.length).toBeLessThan(text.length);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('…')).toBe(true);
  });

  test('划线在开头时不加前省略号', () => {
    expect(excerptAround(`锚定效应${'乙'.repeat(3000)}`, '锚定效应').startsWith('…')).toBe(false);
  });

  test('找不到划线内容时退回开头片段', () => {
    const out = excerptAround('甲'.repeat(5000), '不存在的文字');
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain('…');
  });
});

describe('askAnchored', () => {
  const ok = '{"text":"暂存区决定下次提交的内容。","grounded":true}';

  test('有锚点时只调用一次——不需要检索', async () => {
    const p = stub(ok);
    await askAnchored({ question: '这是什么意思', node, chapters: [chapter(5, '正文')] }, p);
    expect(p.seen).toHaveLength(1);
  });

  test('划线原文被放进提示词', async () => {
    const p = stub(ok);
    await askAnchored({
      question: '为什么', selection: '暂存区', node,
      chapters: [chapter(5, `前文${'甲'.repeat(100)}暂存区${'乙'.repeat(100)}后文`)],
    }, p);
    expect(p.seen[0]!.prompt).toContain('「暂存区」');
  });

  test('当前站的 brief 进入上下文', async () => {
    const p = stub(ok);
    await askAnchored({ question: 'q', node, chapters: [chapter(5, '正文')] }, p);
    expect(p.seen[0]!.prompt).toContain('讲清工作区、暂存区与仓库的关系');
  });

  test('溯源章号来自实际载入的章节', async () => {
    const a = await askAnchored(
      { question: 'q', node, chapters: [chapter(5, '甲'), chapter(7, '乙')] }, stub(ok));
    expect(a.sourceChapters).toEqual([5, 7]);
  });

  test('材料不足时返回 grounded=false 并给出去处', async () => {
    const a = await askAnchored({ question: 'q', node, chapters: [chapter(5, '甲')] },
      stub('{"text":"材料里没讲","grounded":false,"suggestion":"去看第 44 章"}'));
    expect(a.grounded).toBe(false);
    expect(a.suggestion).toBe('去看第 44 章');
  });

  test('系统提示词禁止使用既有知识', async () => {
    const p = stub(ok);
    await askAnchored({ question: 'q', node, chapters: [chapter(5, '甲')] }, p);
    expect(p.seen[0]!.system).toContain('不得使用');
  });
});

describe('noteIndexLocator', () => {
  test('用章节摘要当索引，不需要向量库', async () => {
    const p = stub('{"chapters":[5,44]}');
    expect(await noteIndexLocator(singleBook(notes), p).locate('reset 怎么用')).toEqual([{ chapter: 5 }, { chapter: 44 }]);
    expect(p.seen[0]!.prompt).toContain('[44] reset 详解');
  });

  test('模型臆造的章号被丢弃', async () => {
    const p = stub('{"chapters":[5,999]}');
    expect(await noteIndexLocator(singleBook(notes), p).locate('q')).toEqual([{ chapter: 5 }]);
  });

  test('返回数量被截断', async () => {
    const p = stub('{"chapters":[0,5,44,0,5,44]}');
    expect((await noteIndexLocator(singleBook(notes), p).locate('q')).length).toBeLessThanOrEqual(4);
  });

  test('无相关章节时返回空', async () => {
    expect(await noteIndexLocator(singleBook(notes), stub('{"chapters":[]}')).locate('q')).toEqual([]);
  });
});

describe('askBook', () => {
  const load = async ({ chapter: idx }: ChapterRef): Promise<Chapter | undefined> =>
    [0, 5, 44].includes(idx) ? chapter(idx, `第${idx}章正文`) : undefined;

  test('无锚点时先定位再回答——两次调用', async () => {
    const p = stub((r) => (r.prompt.includes('章节索引') ? '{"chapters":[5]}' : '{"text":"答案","grounded":true}'));
    const a = await askBook({ question: 'q', locator: noteIndexLocator(singleBook(notes), p), loadChapter: load }, p);
    expect(p.seen).toHaveLength(2);
    expect(a.grounded).toBe(true);
    expect(a.sourceChapters).toEqual([5]);
  });

  test('定位不到时不再发起回答调用', async () => {
    const p = stub('{"chapters":[]}');
    const a = await askBook({ question: 'q', locator: noteIndexLocator(singleBook(notes), p), loadChapter: load }, p);
    expect(p.seen).toHaveLength(1);
    expect(a.grounded).toBe(false);
  });

  test('原文已不在本地时如实说明', async () => {
    const p = stub('{"chapters":[5]}');
    const a = await askBook({
      question: 'q', locator: noteIndexLocator(singleBook(notes), p), loadChapter: async () => undefined,
    }, p);
    expect(a.grounded).toBe(false);
    expect(a.text).toContain('不在本地');
  });
});

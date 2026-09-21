import { describe, expect, test } from 'bun:test';
import { askOutside, type SearchResult, type WebSearch } from '../../src/pipeline/ask-outside';
import type { LlmProvider, LlmRequest } from '../../src/llm/types';

const stub = (reply: string): LlmProvider & { seen: LlmRequest[] } => {
  const seen: LlmRequest[] = [];
  return {
    seen, name: 'stub', suggestedConcurrency: 1, overheadTokens: 0,
    async complete(r) { seen.push(r); return reply; },
  };
};

const hits: SearchResult[] = [
  { title: 'git-restore', url: 'https://git-scm.com/docs/git-restore', snippet: '2.23 起可用' },
  { title: '无关', url: 'https://example.com', snippet: '无关内容' },
];
const searcher = (results: readonly SearchResult[]): WebSearch & { queries: string[] } => {
  const queries: string[] = [];
  return { queries, async search(q) { queries.push(q); return results; } };
};

describe('askOutside', () => {
  test('只引用模型实际用到的来源', async () => {
    const a = await askOutside({ question: 'q' }, searcher(hits),
      stub('{"text":"答案","usedSources":[0]}'));
    expect(a.citations).toHaveLength(1);
    expect(a.citations[0]!.url).toContain('git-restore');
  });

  test('模型没标来源时保留全部，绝不出现无出处的答案', async () => {
    const a = await askOutside({ question: 'q' }, searcher(hits), stub('{"text":"答案","usedSources":[]}'));
    expect(a.citations).toHaveLength(2);
  });

  test('臆造的来源编号被丢弃', async () => {
    const a = await askOutside({ question: 'q' }, searcher(hits),
      stub('{"text":"答案","usedSources":[0,99,-1]}'));
    expect(a.citations).toHaveLength(1);
  });

  test('搜不到时不调用模型', async () => {
    const p = stub('{"text":"x","usedSources":[]}');
    const a = await askOutside({ question: 'q' }, searcher([]), p);
    expect(a.empty).toBe(true);
    expect(p.seen).toHaveLength(0);
  });

  test('书名用于收窄查询，但不进入回答提示词', async () => {
    const s = searcher(hits);
    const p = stub('{"text":"答案","usedSources":[0]}');
    await askOutside({ question: 'restore 怎么用', bookTitle: 'Pro Git' }, s, p);
    expect(s.queries[0]).toContain('Pro Git');
    expect(p.seen[0]!.prompt).not.toContain('Pro Git');
  });

  test('系统提示词禁止掺入书里的内容', async () => {
    const p = stub('{"text":"答案","usedSources":[0]}');
    await askOutside({ question: 'q' }, searcher(hits), p);
    expect(p.seen[0]!.system).toContain('不要提及书里的内容');
  });
});

import { describe, expect, test } from 'bun:test';
import { reduceToPath } from '../../src/pipeline/reduce';
import { BUDGETS } from '../../src/pipeline/budget';
import type { LlmProvider, LlmRequest } from '../../src/llm/types';
import type { ChapterNote } from '../../src/types';

const stub = (replies: string | string[]): LlmProvider & { seen: LlmRequest[] } => {
  const queue = Array.isArray(replies) ? [...replies] : [replies];
  const seen: LlmRequest[] = [];
  return {
    seen, name: 'stub', suggestedConcurrency: 1, overheadTokens: 0,
    async complete(r) { seen.push(r); return queue.length > 1 ? queue.shift()! : queue[0]!; },
  };
};

const notes: readonly ChapterNote[] = [0, 1, 2, 3].map((idx) => ({
  idx, title: `第${idx}章`, gist: `摘要${idx}`, keyPoints: [], quotes: [],
}));

const node = (title: string, chapters: number[], min = 3) =>
  ({ title, kind: 'concept', brief: `讲清${title}`, keyPoints: [], sourceChapters: chapters, estMinutes: min });

const reply = (stages: unknown) => JSON.stringify({ stages });

const run = (json: string | string[], budget = BUDGETS.brief) =>
  reduceToPath(notes, 'knowledge', 150_000, stub(json), { budget });

describe('reduce 阶段分组', () => {
  test('产出阶段，nodeIds 覆盖全部站点且保持顺序', async () => {
    const r = await run(reply([
      { title: '建立模型', nodes: [node('甲', [0]), node('乙', [1])] },
      { title: '落到实践', nodes: [node('丙', [2])] },
    ]));

    expect(r.stages.map((s) => s.title)).toEqual(['建立模型', '落到实践']);
    expect(r.stages.flatMap((s) => s.nodeIds)).toEqual(r.nodes.map((n) => n.id));
  });

  test('站点 id 跨阶段连续编号', async () => {
    const r = await run(reply([
      { title: 'A', nodes: [node('甲', [0])] },
      { title: 'B', nodes: [node('乙', [1]), node('丙', [2])] },
    ]));
    expect(r.nodes.map((n) => n.id)).toEqual(['n0', 'n1', 'n2']);
    expect(r.nodes.map((n) => n.idx)).toEqual([0, 1, 2]);
  });

  test('站点全被拒的阶段不会留下空分组', async () => {
    const r = await run(reply([
      { title: '全是假的', nodes: [node('甲', [999])] },
      { title: '真的', nodes: [node('乙', [1])] },
    ]));
    expect(r.stages.map((s) => s.title)).toEqual(['真的']);
    expect(r.dropped).toBe(1);
  });

  test('阶段缺标题时给出兜底名', async () => {
    const r = await run(reply([{ title: '', nodes: [node('甲', [0])] }]));
    expect(r.stages[0]!.title).toBe('第 1 阶段');
  });

  test('阶段内的 nodes 字段缺失不抛错', async () => {
    const r = await run(reply([{ title: 'A' }, { title: 'B', nodes: [node('甲', [0])] }]));
    expect(r.stages).toHaveLength(1);
    expect(r.nodes).toHaveLength(1);
  });
});

describe('reduce 溯源校验', () => {
  test('臆造的章号导致该站被丢弃', async () => {
    const r = await run(reply([{ title: 'A', nodes: [node('真', [1]), node('假', [42])] }]));
    expect(r.nodes.map((n) => n.title)).toEqual(['真']);
    expect(r.dropped).toBe(1);
  });

  test('溯源章号去重并升序', async () => {
    const r = await run(reply([{ title: 'A', nodes: [node('甲', [2, 0, 2, 1])] }]));
    expect(r.nodes[0]!.sourceChapters).toEqual([0, 1, 2]);
  });

  test('没有任何有效站点时抛错而不是返回空路径', async () => {
    expect(run(reply([{ title: 'A', nodes: [node('假', [99])] }]))).rejects.toThrow();
  });
});

describe('reduce 预算', () => {
  test('每站时长被钳进档位区间', async () => {
    const r = await run(reply([{ title: 'A', nodes: [node('甲', [0], 99)] }]), BUDGETS.quick);
    expect(r.nodes[0]!.estMinutes).toBeLessThanOrEqual(BUDGETS.quick.minutesPerNode[1]);
  });

  test('超出预算触发收紧重跑', async () => {
    const fat = reply([{ title: 'A', nodes: Array.from({ length: 20 }, (_, i) => node(`n${i}`, [0], 3)) }]);
    const lean = reply([{ title: 'A', nodes: [node('甲', [0], 3)] }]);
    const r = await reduceToPath(notes, 'knowledge', 150_000, stub([fat, lean]), { budget: BUDGETS.quick });
    expect(r.retries).toBe(1);
    expect(r.nodes).toHaveLength(1);
  });

  test('重跑后仍超标则接受，不无限重试', async () => {
    const fat = reply([{ title: 'A', nodes: Array.from({ length: 20 }, (_, i) => node(`n${i}`, [0], 3)) }]);
    const p = stub([fat, fat]);
    const r = await reduceToPath(notes, 'knowledge', 150_000, p, { budget: BUDGETS.quick });
    expect(r.retries).toBe(1);
    expect(p.seen).toHaveLength(2);
  });
});

describe('reduce 提示词', () => {
  test('要求模型给阶段起描述读者动作的名字', async () => {
    const p = stub(reply([{ title: 'A', nodes: [node('甲', [0])] }]));
    await reduceToPath(notes, 'knowledge', 150_000, p, { budget: BUDGETS.brief });
    expect(p.seen[0]!.system).toContain('读者此刻在做什么');
    expect(p.seen[0]!.prompt).toContain('阶段');
  });

  test('叙事类与知识类给出不同的取舍指引', async () => {
    const json = reply([{ title: 'A', nodes: [node('甲', [0])] }]);
    const k = stub(json); const n = stub(json);
    await reduceToPath(notes, 'knowledge', 150_000, k, { budget: BUDGETS.brief });
    await reduceToPath(notes, 'narrative', 150_000, n, { budget: BUDGETS.brief });
    expect(k.seen[0]!.system).not.toBe(n.seen[0]!.system);
  });
});

describe('reduce 阶段数量随站数缩放', () => {
  test('少量站点不会一站一阶段', async () => {
    const p = stub(reply([{ title: 'A', nodes: [node('甲', [0])] }]));
    await reduceToPath(notes, 'knowledge', 60_000, p, { budget: BUDGETS.quick });
    expect(p.seen[0]!.prompt).toContain('每个阶段至少 2 站');
  });
});

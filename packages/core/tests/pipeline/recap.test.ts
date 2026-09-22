import { describe, expect, test } from 'bun:test';
import { isRecap, makeRecapDeck, RECAP_NODE_ID, withRecap } from '../../src/pipeline/recap';
import { budgetsFor } from '../../src/pipeline/budget';

const BUDGETS = budgetsFor({ totalWords: 200_000, chapterCount: 86 });
import type { ReduceResult } from '../../src/pipeline/reduce';
import type { LlmProvider, LlmRequest } from '../../src/llm/types';
import type { PathNode, Stage } from '../../src/types';

const stub = (reply: string): LlmProvider & { seen: LlmRequest[] } => {
  const seen: LlmRequest[] = [];
  return { seen, name: 'stub', suggestedConcurrency: 1, overheadTokens: 0,
    async complete(r) { seen.push(r); return reply; } };
};

const station = (i: number, chapters: number[]): PathNode => ({
  id: `n${i}`, idx: i, title: `第${i}站`, kind: 'concept',
  brief: `讲清第${i}件事`, keyPoints: [`要点${i}`], sourceChapters: chapters, estMinutes: 3,
});

const reduced = (count: number, stages?: readonly Stage[]): ReduceResult => {
  const nodes = Array.from({ length: count }, (_, i) => station(i, [i]));
  return {
    nodes,
    stages: stages ?? [{ title: '建立模型', nodeIds: nodes.map((n) => n.id) }],
    budget: BUDGETS.brief,
    totalMinutes: count * 3,
    retries: 0,
    dropped: 0,
  };
};

describe('withRecap', () => {
  test('在所有站点之后追加一站，并单独成一个阶段', () => {
    const r = withRecap(reduced(6));
    expect(r.nodes).toHaveLength(7);
    expect(r.nodes.at(-1)!.id).toBe(RECAP_NODE_ID);
    expect(r.nodes.at(-1)!.idx).toBe(6);
    expect(r.stages.at(-1)!.nodeIds).toEqual([RECAP_NODE_ID]);
    // 前面的站点和阶段原样保留
    expect(r.nodes.slice(0, 6)).toEqual([...reduced(6).nodes]);
  });

  test('总时长把回望站算进去，不谎报', () => {
    const base = reduced(6);
    const r = withRecap(base);
    expect(r.totalMinutes).toBe(base.totalMinutes + r.nodes.at(-1)!.estMinutes);
  });

  test('回望站的溯源章节是各站的并集，去重且升序', () => {
    const base = reduced(0);
    const nodes = [station(0, [3, 1]), station(1, [1, 0]), station(2, [7])];
    const r = withRecap({ ...base, nodes, stages: [{ title: 'A', nodeIds: nodes.map((n) => n.id) }] });
    expect(r.nodes.at(-1)!.sourceChapters).toEqual([0, 1, 3, 7]);
  });

  test('站点太少时不加回望站：读者还全记得', () => {
    const base = reduced(2);
    expect(withRecap(base)).toEqual(base);
  });

  test('每站时长被钳进档位区间', () => {
    const r = withRecap({ ...reduced(30), budget: BUDGETS.quick });
    const recap = r.nodes.at(-1)!;
    expect(recap.estMinutes).toBeLessThanOrEqual(BUDGETS.quick.minutesPerNode[1]);
    expect(recap.estMinutes).toBeGreaterThanOrEqual(BUDGETS.quick.minutesPerNode[0]);
  });

  test('isRecap 只认这一站', () => {
    const r = withRecap(reduced(4));
    expect(r.nodes.filter(isRecap).map((n) => n.id)).toEqual([RECAP_NODE_ID]);
  });
});

describe('makeRecapDeck', () => {
  const node = withRecap(reduced(4)).nodes.at(-1)!;
  const stations = reduced(4).nodes;
  const reply = JSON.stringify({
    sentences: ['第一句。', '第二句。'],
    slides: [{ layout: 'points', heading: '这本书主张', points: ['甲'], atSentence: 0 }],
  });

  test('材料是走过的站点，不是章节原文', async () => {
    const p = stub(reply);
    await makeRecapDeck(node, stations, '深度工作', p, undefined);
    const prompt = p.seen[0]!.prompt;
    expect(prompt).toContain('深度工作');
    for (const s of stations) expect(prompt).toContain(s.title);
  });

  test('明确要求收束而不是逐站复述', async () => {
    const p = stub(reply);
    await makeRecapDeck(node, stations, '深度工作', p, undefined);
    expect(p.seen[0]!.system).toContain('不要逐站复述');
  });

  test('产出的 deck 挂在回望站上', async () => {
    const d = await makeRecapDeck(node, stations, '深度工作', stub(reply), undefined);
    expect(d.nodeId).toBe(RECAP_NODE_ID);
    expect(d.slides).toHaveLength(1);
  });

  test('没有口播稿时抛错而不是返回空 deck', () => {
    const empty = JSON.stringify({ sentences: [], slides: [] });
    expect(makeRecapDeck(node, stations, '深度工作', stub(empty), undefined)).rejects.toThrow('回望');
  });
});

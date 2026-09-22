import { describe, expect, test } from 'bun:test';
import { memoryTraceSink, tracingProvider, UNLABELLED } from '../../src/llm/trace';
import { LlmError, type LlmProvider, type LlmRequest } from '../../src/llm/types';

function stub(reply: string | ((r: LlmRequest) => string | never)): LlmProvider {
  return {
    name: 'stub',
    suggestedConcurrency: 3,
    overheadTokens: 42,
    async complete(request) {
      return typeof reply === 'string' ? reply : reply(request);
    },
  };
}

describe('tracingProvider', () => {
  test('透传回答，不改动内容', async () => {
    const sink = memoryTraceSink();
    const out = await tracingProvider(stub('答案'), sink).complete({ prompt: 'q' });
    expect(out).toBe('答案');
  });

  test('保留内层 provider 的并发与开销，调度才不会被悄悄改掉', () => {
    const wrapped = tracingProvider(stub('x'), memoryTraceSink());
    expect(wrapped.name).toBe('stub');
    expect(wrapped.suggestedConcurrency).toBe(3);
    expect(wrapped.overheadTokens).toBe(42);
  });

  test('记下提示词与原始回复——这才是能重放的东西', async () => {
    const sink = memoryTraceSink();
    await tracingProvider(stub('原始输出'), sink).complete({
      prompt: 'q', system: 's', label: 'reduce', schema: { type: 'object' },
    });

    const entry = sink.entries[0]!;
    expect(entry.label).toBe('reduce');
    expect(entry.prompt).toBe('q');
    expect(entry.system).toBe('s');
    expect(entry.raw).toBe('原始输出');
    expect(entry.schema).toEqual({ type: 'object' });
    expect(entry.error).toBeUndefined();
  });

  test('没有 label 的调用也记，不能因此丢掉', async () => {
    const sink = memoryTraceSink();
    await tracingProvider(stub('x'), sink).complete({ prompt: 'q' });
    expect(sink.entries[0]!.label).toBe(UNLABELLED);
  });

  test('失败的调用照样记下来——出错的那次最值得看', async () => {
    const sink = memoryTraceSink();
    const failing = tracingProvider(
      stub(() => { throw new LlmError('模型输出不是合法 JSON', 'bad_output'); }),
      sink,
    );

    await expect(failing.complete({ prompt: 'q', label: 'map:0-3' })).rejects.toThrow();
    expect(sink.entries).toHaveLength(1);
    expect(sink.entries[0]!.error).toContain('不是合法 JSON');
    expect(sink.entries[0]!.raw).toBeUndefined();
  });

  test('sink 写失败不影响这次生成——诊断不该拖垮被诊断的东西', async () => {
    const broken = { async write(): Promise<void> { throw new Error('磁盘满了'); } };
    expect(await tracingProvider(stub('答案'), broken).complete({ prompt: 'q' })).toBe('答案');
  });

  test('sink 写失败也不会掩盖原本的错误', async () => {
    const broken = { async write(): Promise<void> { throw new Error('磁盘满了'); } };
    const failing = tracingProvider(stub(() => { throw new Error('codex 退出码 1'); }), broken);
    await expect(failing.complete({ prompt: 'q' })).rejects.toThrow('codex 退出码 1');
  });

  test('记录耗时，慢调用才找得出来', async () => {
    const sink = memoryTraceSink();
    await tracingProvider(stub('x'), sink).complete({ prompt: 'q' });
    expect(sink.entries[0]!.ms).toBeGreaterThanOrEqual(0);
  });

  test('内存 sink 有上限，长跑不会把内存吃光', async () => {
    const sink = memoryTraceSink(3);
    const p = tracingProvider(stub('x'), sink);
    for (let i = 0; i < 10; i += 1) await p.complete({ prompt: 'q', label: `c${i}` });
    expect(sink.entries).toHaveLength(3);
    expect(sink.entries[2]!.label).toBe('c9');
  });
});

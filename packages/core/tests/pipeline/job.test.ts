import { describe, expect, test } from 'bun:test';
import {
  JobAbortedError, memoryStore, runJob, type JobProgress, type JobTask,
} from '../../src/pipeline/job';

const tasks = (n: number): JobTask<number>[] =>
  Array.from({ length: n }, (_, i) => ({ id: `t${i}`, input: i }));

/** 测试里不真的等待，但保留调用次数以便断言重试发生过。 */
const fastSleep = (): { sleep: () => Promise<void>; calls: number[] } => {
  const calls: number[] = [];
  return { sleep: async (ms?: number) => { calls.push(ms ?? 0); }, calls };
};

describe('runJob 基本', () => {
  test('全部执行并返回结果', async () => {
    const r = await runJob(tasks(5), async (n) => n * 2, memoryStore<number>());
    expect(r.results.size).toBe(5);
    expect(r.results.get('t3')).toBe(6);
    expect(r.complete).toBe(true);
  });

  test('空任务列表不报错', async () => {
    const r = await runJob([], async (n: number) => n, memoryStore<number>());
    expect(r.complete).toBe(true);
    expect(r.progress.total).toBe(0);
  });

  test('每个结果立刻落盘，不等整批结束', async () => {
    const store = memoryStore<number>();
    await runJob(tasks(4), async (n) => {
      if (n === 3) throw new Error('最后一个炸了');
      return n;
    }, store, { maxAttempts: 1 });
    // 前三个即便第四个失败也必须已经在库里
    expect([...store.data.keys()].sort()).toEqual(['t0', 't1', 't2']);
  });
});

describe('runJob 并发', () => {
  test('并发数不超过上限', async () => {
    let now = 0;
    let peak = 0;
    const worker = async (n: number): Promise<number> => {
      now += 1;
      peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 5));
      now -= 1;
      return n;
    };
    await runJob(tasks(20), worker, memoryStore<number>(), { concurrency: 4 });
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  test('任务数少于并发数时不起多余的泳道', async () => {
    let peak = 0;
    let now = 0;
    await runJob(tasks(2), async (n) => {
      now += 1; peak = Math.max(peak, now);
      await new Promise((r) => setTimeout(r, 5));
      now -= 1; return n;
    }, memoryStore<number>(), { concurrency: 8 });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('runJob 重试', () => {
  test('失败后重试并最终成功', async () => {
    const { sleep, calls } = fastSleep();
    let attempts = 0;
    const r = await runJob(tasks(1), async (n) => {
      attempts += 1;
      if (attempts < 3) throw new Error('临时失败');
      return n;
    }, memoryStore<number>(), { maxAttempts: 3, sleep });

    expect(attempts).toBe(3);
    expect(r.complete).toBe(true);
    expect(calls).toHaveLength(2);
  });

  test('退避时间指数增长', async () => {
    const { sleep, calls } = fastSleep();
    await runJob(tasks(1), async () => { throw new Error('总是失败'); },
      memoryStore<number>(), { maxAttempts: 3, baseDelayMs: 100, sleep });
    expect(calls[0]).toBeGreaterThanOrEqual(100);
    expect(calls[1]).toBeGreaterThanOrEqual(200);
    expect(calls[1]!).toBeGreaterThan(calls[0]!);
  });

  test('超过 maxAttempts 记为失败但不抛出', async () => {
    const { sleep } = fastSleep();
    const r = await runJob(tasks(1), async () => { throw new Error('坏了'); },
      memoryStore<number>(), { maxAttempts: 2, sleep });

    expect(r.complete).toBe(false);
    expect(r.failures).toHaveLength(1);
    expect(r.failures[0]!.taskId).toBe('t0');
    expect(r.failures[0]!.error.message).toBe('坏了');
  });

  test('单个任务失败不影响其他任务', async () => {
    const { sleep } = fastSleep();
    const r = await runJob(tasks(10), async (n) => {
      if (n === 4) throw new Error('第五章解析不了');
      return n;
    }, memoryStore<number>(), { maxAttempts: 1, sleep });

    expect(r.results.size).toBe(9);
    expect(r.failures).toHaveLength(1);
    expect(r.complete).toBe(false);
  });

  test('非 Error 抛出物被包装成 Error', async () => {
    const { sleep } = fastSleep();
    const r = await runJob(tasks(1), async () => { throw '字符串异常'; },
      memoryStore<number>(), { maxAttempts: 1, sleep });
    expect(r.failures[0]!.error).toBeInstanceOf(Error);
    expect(r.failures[0]!.error.message).toBe('字符串异常');
  });
});

describe('runJob 断点续跑', () => {
  test('已落盘的任务不再调用 worker', async () => {
    const store = memoryStore<number>([['t0', 100], ['t1', 101]]);
    const seen: number[] = [];
    const r = await runJob(tasks(4), async (n) => { seen.push(n); return n; }, store);

    expect(seen.sort()).toEqual([2, 3]);
    expect(r.results.get('t0')).toBe(100);
    expect(r.progress.skipped).toBe(2);
  });

  test('第二次运行只重跑失败的任务', async () => {
    const { sleep } = fastSleep();
    const store = memoryStore<number>();
    let broken = true;

    const worker = async (n: number): Promise<number> => {
      if (n === 2 && broken) throw new Error('暂时失败');
      return n;
    };

    const first = await runJob(tasks(5), worker, store, { maxAttempts: 1, sleep });
    expect(first.complete).toBe(false);

    broken = false;
    const seen: number[] = [];
    const second = await runJob(tasks(5), async (n) => {
      seen.push(n); return worker(n);
    }, store, { maxAttempts: 1, sleep });

    expect(seen).toEqual([2]);
    expect(second.complete).toBe(true);
    expect(second.results.size).toBe(5);
  });
});

describe('runJob 取消', () => {
  test('中途取消抛 JobAbortedError', async () => {
    const controller = new AbortController();
    const run = runJob(tasks(50), async (n) => {
      if (n === 3) controller.abort();
      await new Promise((r) => setTimeout(r, 2));
      return n;
    }, memoryStore<number>(), { concurrency: 2, signal: controller.signal });

    expect(run).rejects.toThrow(JobAbortedError);
  });

  test('开始前即已取消则不执行任何任务', async () => {
    const seen: number[] = [];
    const run = runJob(tasks(5), async (n) => { seen.push(n); return n; },
      memoryStore<number>(), { signal: AbortSignal.abort() });
    await run.catch(() => undefined);
    expect(seen).toHaveLength(0);
  });
});

describe('runJob 进度', () => {
  test('进度回调随完成数递增', async () => {
    const snapshots: JobProgress[] = [];
    await runJob(tasks(6), async (n) => n, memoryStore<number>(), {
      concurrency: 2,
      onProgress: (p) => snapshots.push(p),
    });

    expect(snapshots.length).toBeGreaterThan(6);
    expect(snapshots[0]!.total).toBe(6);
    expect(snapshots.at(-1)!.done).toBe(6);
    expect(snapshots.at(-1)!.running).toBe(0);
  });

  test('running 数始终不超过并发上限', async () => {
    const snapshots: JobProgress[] = [];
    await runJob(tasks(12), async (n) => n, memoryStore<number>(), {
      concurrency: 3,
      onProgress: (p) => snapshots.push(p),
    });
    for (const s of snapshots) expect(s.running).toBeLessThanOrEqual(3);
  });

  test('failed 计入进度', async () => {
    const { sleep } = fastSleep();
    const r = await runJob(tasks(3), async (n) => {
      if (n === 1) throw new Error('x');
      return n;
    }, memoryStore<number>(), { maxAttempts: 1, sleep });
    expect(r.progress.failed).toBe(1);
    expect(r.progress.done).toBe(2);
  });
});

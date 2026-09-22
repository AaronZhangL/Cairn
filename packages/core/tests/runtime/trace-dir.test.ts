import { describe, expect, test } from 'bun:test';
import { traceFileName } from '../../src/runtime/trace-dir';

describe('traceFileName', () => {
  test('label 直接成为文件名，才找得到想重放的那次', () => {
    expect(traceFileName('reduce', 0)).toBe('reduce.json');
    expect(traceFileName('map:0-3', 0)).toBe('map:0-3.json');
  });

  test('重复的 label 加序号——重试那次不能覆盖失败那次', () => {
    expect(traceFileName('reduce', 1)).toBe('reduce.1.json');
    expect(traceFileName('reduce', 2)).toBe('reduce.2.json');
  });

  test('路径分隔符被清掉，label 写不出目录', () => {
    expect(traceFileName('../../etc/passwd', 0)).not.toContain('/');
    expect(traceFileName('a/b', 0)).toBe('a-b.json');
  });

  test('中文 label 不会留下空名字', () => {
    expect(traceFileName('第三站', 0)).toBe('call.json');
  });

  test('过长的 label 被截断', () => {
    expect(traceFileName('x'.repeat(200), 0).length).toBeLessThanOrEqual(70);
  });
});

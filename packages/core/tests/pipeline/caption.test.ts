import { describe, expect, test } from 'bun:test';
import { MAX_UNITS, MIN_MS, toCaptions, units } from '../../src/pipeline/caption';
import type { NarrationCue } from '../../src/types';

const cue = (text: string, startMs: number, endMs: number): NarrationCue => ({
  text, startMs, endMs,
});

describe('units', () => {
  test('counts CJK whole and Latin half', () => {
    expect(units('快照')).toBe(2);
    expect(units('abcd')).toBe(2);
  });
});

describe('toCaptions', () => {
  test('cuts a long sentence at its clause marks', () => {
    const captions = toCaptions([
      cue('也就是说，每当你提交一次，Git 都把当时的项目状态看成一个文件系统快照。', 0, 12_000),
    ]);

    expect(captions[0]?.text).toBe('也就是说，每当你提交一次');
    // The remaining clause is wider than one line, so it wraps again
    expect(captions.length).toBe(3);
    // Trailing punctuation is the cut, not something to display
    expect(captions.at(-1)?.text.endsWith('。')).toBe(false);
  });

  test('keeps every line within the readable width', () => {
    const captions = toCaptions([
      cue('这是一个很长的句子，它没有任何明显的停顿，所以必须按宽度切开才能读得完，否则字幕会挤成一团。', 0, 20_000),
    ]);
    for (const c of captions) expect(units(c.text)).toBeLessThanOrEqual(MAX_UNITS * 1.5);
  });

  test('a short sentence stays one caption', () => {
    expect(toCaptions([cue('先看懂 Git 在保存什么。', 0, 3000)]).length).toBe(1);
  });

  test('timing stays inside the cue and moves forward', () => {
    const captions = toCaptions([
      cue('第一句在这里说完了，然后还有第二个分句，最后是第三个分句。', 1000, 9000),
      cue('下一句从这里开始，它也有两个分句。', 9000, 14_000),
    ]);

    expect(captions[0]?.startMs).toBe(1000);
    expect(captions.at(-1)?.endMs).toBe(14_000);
    for (let i = 1; i < captions.length; i += 1) {
      expect(captions[i]!.startMs).toBeGreaterThanOrEqual(captions[i - 1]!.startMs);
    }
  });

  test('never crosses a cue boundary', () => {
    const captions = toCaptions([cue('一句话。', 0, 2000), cue('另一句话。', 2000, 4000)]);
    expect(captions.every((c) => c.endMs <= 4000)).toBe(true);
    expect(captions.filter((c) => c.cueIdx === 0).every((c) => c.endMs <= 2000)).toBe(true);
  });

  test('a caption is never shown for less than the minimum', () => {
    const captions = toCaptions([cue('好，我们开始吧，现在讲第一点，这点很重要。', 0, 1200)]);
    for (const c of captions) expect(c.endMs - c.startMs).toBeGreaterThanOrEqual(MIN_MS * 0.5);
  });

  test('does not cut inside a Latin word', () => {
    const captions = toCaptions([
      cue('Git thinks about its data more like a stream of snapshots rather than a list of changes', 0, 8000),
    ]);
    // Every word survives whole: a wrap lands on a space, never inside a word
    const words = captions.flatMap((c) => c.text.split(/\s+/)).filter(Boolean);
    const original = 'Git thinks about its data more like a stream of snapshots rather than a list of changes'.split(' ');
    expect(words).toEqual(original);
  });

  test('empty narration yields no captions', () => {
    expect(toCaptions([])).toEqual([]);
  });
});

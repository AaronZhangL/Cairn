import { describe, expect, test } from 'bun:test';
import { alignSentences, cuesFromBoundaries } from '../../src/pipeline/tts';

/** edge-tts 的 WordBoundary 事件：offset/duration 是 100 纳秒单位。 */
const tick = (ms: number): number => ms * 10_000;

describe('cuesFromBoundaries', () => {
  test('字幕文本拼回原文，一个字符不多不少', () => {
    const text = 'Anchoring is a bias. People fix on the first number. ';
    const words = ['Anchoring', 'is', 'a', 'bias.', 'People', 'fix', 'on', 'the', 'first', 'number.'];
    const cues = cuesFromBoundaries(
      text,
      words.map((w, i) => ({ text: w, offset: tick(i * 400), duration: tick(380) })),
    );

    // alignSentences 靠累计字符偏移定位，所以这条是整个转换的地基
    expect(cues.map((c) => c.text).join('')).toBe(text);
  });

  test('一条字幕从首词开始、到末词结束', () => {
    const cues = cuesFromBoundaries('One up. Two down.', [
      { text: 'One', offset: tick(0), duration: tick(300) },
      { text: 'up.', offset: tick(300), duration: tick(300) },
      { text: 'Two', offset: tick(700), duration: tick(300) },
      { text: 'down.', offset: tick(1000), duration: tick(400) },
    ]);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toMatchObject({ text: 'One up. ', startMs: 0, endMs: 600 });
    expect(cues[1]).toMatchObject({ text: 'Two down.', startMs: 700, endMs: 1400 });
  });

  test('词级事件合并成句级字幕，因为 alignSentences 取句子中点', () => {
    const words = ['Anchoring', 'is', 'a', 'bias.', 'People', 'fix', 'on', 'it.'];
    const cues = cuesFromBoundaries(
      'Anchoring is a bias. People fix on it.',
      words.map((w, i) => ({ text: w, offset: tick(i * 400), duration: tick(380) })),
    );
    expect(cues).toHaveLength(2);
  });

  test('中文没有空格也对得上', () => {
    const text = '锚定效应是一种偏误。受试者先转轮盘。';
    const cues = cuesFromBoundaries(text, [
      { text: '锚定效应', offset: tick(0), duration: tick(800) },
      { text: '是一种偏误', offset: tick(800), duration: tick(900) },
      { text: '受试者', offset: tick(1800), duration: tick(600) },
      { text: '先转轮盘', offset: tick(2400), duration: tick(700) },
    ]);
    expect(cues.map((c) => c.text).join('')).toBe(text);
  });

  test('模型念出原文里没有的词时不崩，也不吞掉原文', () => {
    const text = 'one two three';
    const cues = cuesFromBoundaries(text, [
      { text: 'one', offset: tick(0), duration: tick(300) },
      { text: 'ZZZ', offset: tick(300), duration: tick(300) },
      { text: 'three', offset: tick(600), duration: tick(300) },
    ]);
    expect(cues.map((c) => c.text).join('')).toBe(text);
  });

  test('没有事件时给空数组，由调用方报 tts_no_cues', () => {
    expect(cuesFromBoundaries('anything', [])).toEqual([]);
  });
});

describe('cuesFromBoundaries + alignSentences', () => {
  // 这就是词级 cue 直接喂给 alignSentences 会坏掉的那个场景：
  // 拼接词文本丢了空格和标点，第二句会偏两秒。
  test('句子落到正确的词上', () => {
    const sentences = ['Anchoring is a bias. ', 'People fix on the first number. '];
    const words = ['Anchoring', 'is', 'a', 'bias.', 'People', 'fix', 'on', 'the', 'first', 'number.'];
    const out = alignSentences(
      sentences,
      cuesFromBoundaries(text(sentences), words.map((w, i) => ({
        text: w, offset: tick(i * 400), duration: tick(380),
      }))),
    );

    expect(out[0]!.startMs).toBe(0);
    // "People" 是第 5 个词，1600ms
    expect(out[1]!.startMs).toBe(1600);
  });
});

function text(sentences: readonly string[]): string {
  return sentences.join('');
}

import { describe, expect, test } from 'bun:test';
import { alignSentences, candidateDirs, findEdgeTts, parseSrt } from '../../src/pipeline/tts';

const SRT = `1
00:00:00,100 --> 00:00:05,937
锚定效应是指人们过度依赖最先接触到的信息。

2
00:00:05,887 --> 00:00:09,237
受试者先转一个做过手脚的轮盘。

3
00:00:09,237 --> 00:00:12,525
停在十的人平均猜二十五。
`;

describe('parseSrt', () => {
  test('解析出全部字幕与毫秒时间', () => {
    const cues = parseSrt(SRT);
    expect(cues).toHaveLength(3);
    expect(cues[0]!.startMs).toBe(100);
    expect(cues[2]!.endMs).toBe(12_525);
  });

  test('修正重叠——第一条结束时间晚于第二条开始', () => {
    const cues = parseSrt(SRT);
    expect(cues[0]!.endMs).toBe(cues[1]!.startMs);
  });

  test('空串返回空数组', () => expect(parseSrt('')).toHaveLength(0));

  test('缺时间行的块被跳过', () => {
    expect(parseSrt('1\n没有时间行\n\n2\n00:00:01,000 --> 00:00:02,000\n有的')).toHaveLength(1);
  });
});

describe('alignSentences', () => {
  const cues = parseSrt(SRT);

  test('句子切分与字幕一致时逐条对上', () => {
    const out = alignSentences(
      ['锚定效应是指人们过度依赖最先接触到的信息。', '受试者先转一个做过手脚的轮盘。', '停在十的人平均猜二十五。'],
      cues);
    expect(out.map((c) => c.startMs)).toEqual([100, 5887, 9237]);
  });

  test('我们切得比字幕细时，仍按字符位置落到正确的字幕', () => {
    // edge-tts 按句号切，我们额外切了逗号——两句都该落在第一条字幕内
    const out = alignSentences(
      ['锚定效应是指人们', '过度依赖最先接触到的信息。', '受试者先转一个做过手脚的轮盘。', '停在十的人平均猜二十五。'],
      cues);
    expect(out[0]!.startMs).toBe(100);
    expect(out[1]!.startMs).toBe(100);
    expect(out[2]!.startMs).toBe(5887);
  });

  test('时间轴单调不回退', () => {
    const out = alignSentences(['甲。', '乙。', '丙。', '丁。'], cues);
    for (let i = 1; i < out.length; i += 1) {
      expect(out[i]!.startMs).toBeGreaterThanOrEqual(out[i - 1]!.startMs);
    }
  });

  test('句子多于字幕时全部有时间，不留空', () => {
    const out = alignSentences(Array.from({ length: 10 }, (_, i) => `第${i}句。`), cues);
    expect(out).toHaveLength(10);
    expect(out.every((c) => c.startMs >= 0 && c.endMs > 0)).toBe(true);
  });
});

describe('语速常数', () => {
  test('目标字数随时长线性增长', async () => {
    const { targetChars } = await import('../../src/pipeline/tts');
    expect(targetChars(4)).toBeGreaterThan(targetChars(2));
    expect(targetChars(4) / targetChars(2)).toBeCloseTo(2, 1);
  });

  test('4 分钟约 1176 字 —— 实测 4.9 字/秒', async () => {
    const { targetChars } = await import('../../src/pipeline/tts');
    expect(targetChars(4)).toBeGreaterThan(1050);
    expect(targetChars(4)).toBeLessThan(1300);
  });

  test('反向估算与目标字数自洽', async () => {
    const { targetChars, estimateMs } = await import('../../src/pipeline/tts');
    const ms = estimateMs('甲'.repeat(targetChars(3)));
    expect(ms / 1000 / 60).toBeCloseTo(3, 1);
  });
});

describe('edge-tts discovery', () => {
  test('looks beyond PATH, where a pip-installed tool actually lands', () => {
    const dirs = candidateDirs('/Users/x');
    expect(dirs).toContain('/Users/x/.local/bin');
    expect(dirs).toContain('/opt/homebrew/bin');
    expect(dirs).toContain('/Users/x/.pyenv/shims');
  });

  test('an explicit override wins over discovery', async () => {
    const before = process.env.CAIRN_EDGE_TTS;
    process.env.CAIRN_EDGE_TTS = '/custom/edge-tts';
    try {
      expect(await findEdgeTts()).toBe('/custom/edge-tts');
    } finally {
      if (before === undefined) delete process.env.CAIRN_EDGE_TTS;
      else process.env.CAIRN_EDGE_TTS = before;
    }
  });
});

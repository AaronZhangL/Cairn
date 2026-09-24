import { describe, expect, test } from 'bun:test';
import { locateQuote, makeDeck, slideCount } from '../../src/pipeline/slides';
import type { LlmProvider, LlmRequest } from '../../src/llm/types';
import { BUDGETS, HARD_CAP } from '../../src/fit';
import type { ChapterNote, PathNode } from '../../src/types';

const stub = (reply: string): LlmProvider & { seen: LlmRequest[] } => {
  const seen: LlmRequest[] = [];
  return { seen, name: 'stub', suggestedConcurrency: 1, overheadTokens: 0,
    async complete(r) { seen.push(r); return reply; } };
};

const node: PathNode = {
  id: 'n3', idx: 3, title: '锚定效应', kind: 'concept',
  brief: '讲清先听到的数字会绑架判断', keyPoints: ['锚定不可抗'],
  sourceChapters: [11], estMinutes: 3,
};
const notes: ChapterNote[] = [{
  idx: 11, title: '锚定效应', gist: '轮盘实验',
  keyPoints: ['停在10的猜25%'], quotes: ['锚定是系统1的产物'],
}];

const deck = (slides: unknown[], sentences = ['第一句。', '第二句。', '第三句。']) =>
  JSON.stringify({ sentences, slides });

/** A string of n CJK characters, which `units` measures as n. */
const cjk = (n: number): string => '字'.repeat(n);
/** Just past the last rung of the fit ladder for this field. */
const unrenderable = (field: keyof typeof BUDGETS): string =>
  cjk(Math.ceil(BUDGETS[field] * HARD_CAP) + 1);

describe('makeDeck 新版式', () => {
  test('timeline 至少两条，每条 mark 与正文都要有', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'timeline', items: [{ mark: '第 1 天', text: '开始' }], atSentence: 0 },
      { layout: 'timeline', items: [{ mark: '第 1 天' }, { mark: '第 2 周', text: '放弃高峰' }], atSentence: 1 },
      {
        layout: 'timeline',
        items: [{ mark: '第 1 天', text: '开始' }, { mark: '第 66 天', text: '自动化' }],
        atSentence: 2,
      },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('matrix 要两个列名和至少两行，行里三格齐全', async () => {
    const row = { aspect: '关注点', left: '终点', right: '过程' };
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'matrix', left: '目标', rows: [row, row], atSentence: 0 },
      { layout: 'matrix', left: '目标', right: '体系', rows: [row], atSentence: 1 },
      { layout: 'matrix', left: '目标', right: '体系', rows: [row, { aspect: '失败时', left: '重来' }], atSentence: 2 },
      { layout: 'matrix', left: '目标', right: '体系', rows: [row, { aspect: '失败时', left: '重来', right: '漏一次' }], atSentence: 2 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('relation 至少两条链接，from/how/to 缺一不可', async () => {
    const link = { from: '提示', how: '触发', to: '渴望' };
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'relation', links: [link], atSentence: 0 },
      { layout: 'relation', links: [link, { from: '环境', to: '行为' }], atSentence: 1 },
      { layout: 'relation', links: [link, { from: '环境', how: '提高', to: '概率' }], atSentence: 2 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('超出条数上限的部分被截掉，而不是整张丢弃', async () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ mark: `第 ${i} 天`, text: `第 ${i} 步` }));
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'timeline', items, atSentence: 0 },
    ])));
    const s = d.slides[0]!.slide;
    expect(s.layout === 'timeline' && s.items).toHaveLength(6);
  });
});

describe('makeDeck 长度上限', () => {
  test('必填字段长到没有字号放得下时，整张幻灯丢弃', async () => {
    // Not a taste judgement: past the last rung in fit.ts there is no size
    // that keeps the text inside its box, so rendering it would overflow.
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'points', heading: unrenderable('heading'), points: ['甲'], atSentence: 0 },
      { layout: 'points', heading: '要点', points: [unrenderable('point')], atSentence: 1 },
      { layout: 'points', heading: '要点', points: ['甲'], atSentence: 2 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('刚好在上限内的保留：分档会把它缩到放得下', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'points', heading: cjk(Math.floor(BUDGETS.heading * HARD_CAP)), points: ['甲'], atSentence: 0 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('可选字段超限只丢这个字段，不丢它所在的卡片', async () => {
    // Losing a kicker is not worth losing the station's opening card.
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'title', title: '锚定效应', kicker: unrenderable('kicker'), atSentence: 0 },
    ])));
    expect(d.slides).toHaveLength(1);
    const s = d.slides[0]!.slide;
    expect(s.layout === 'title' && s.kicker).toBeUndefined();
  });

  test('一组里有一条超限，整张丢弃而不是悄悄少一条', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'flow', steps: ['一', unrenderable('step'), '三'], atSentence: 0 },
    ])));
    expect(d.slides).toHaveLength(0);
  });

  test('number 的数值与标签各自有上限', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'number', items: [{ value: unrenderable('value'), label: '标签' }], atSentence: 0 },
      { layout: 'number', items: [{ value: '25%', label: unrenderable('label') }], atSentence: 1 },
      { layout: 'number', items: [{ value: '25%', label: '停在10' }], atSentence: 2 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('compare 一栏的标题超限就整张丢弃', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      {
        layout: 'compare',
        left: { title: 'A', points: ['甲'] },
        right: { title: unrenderable('paneTitle'), points: ['乙'] },
        atSentence: 0,
      },
    ])));
    expect(d.slides).toHaveLength(0);
  });
});

describe('makeDeck 提示词', () => {
  test('章节笔记里的结构化材料被交给模型', async () => {
    const rich = [{
      ...notes[0]!,
      figures: [{ value: '32 华氏度', label: '融点' }],
      contrasts: [{ about: '关注点', left: '终点', right: '过程' }],
      sequences: [{ title: '四步', steps: [{ mark: '1', text: '提示' }, { mark: '2', text: '渴望' }] }],
      relations: [{ from: '提示', how: '触发', to: '渴望' }],
    }];
    const provider = stub(deck([]));
    await makeDeck(node, rich, provider);

    const prompt = provider.seen[0]!.prompt;
    expect(prompt).toContain('32 华氏度');
    expect(prompt).toContain('关注点: 终点 / 过程');
    expect(prompt).toContain('1 提示 → 2 渴望');
    expect(prompt).toContain('提示 触发 渴望');
  });
});

describe('makeDeck 版式校验', () => {
  test('缺必填字段的幻灯被丢弃，不产出半截版式', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'points', atSentence: 0 },                          // 缺 heading/points
      { layout: 'points', heading: '要点', points: ['甲'], atSentence: 1 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('未知版式被丢弃', async () => {
    const d = await makeDeck(node, notes, stub(deck([{ layout: 'chart', atSentence: 0 }])));
    expect(d.slides).toHaveLength(0);
  });

  test('number 版式必须有 value 与 label 齐全的数据', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'number', items: [{ value: '25%' }, { value: '45%', label: '停在65' }], atSentence: 0 },
    ])));
    expect(d.slides).toHaveLength(1);
    const s = d.slides[0]!.slide;
    expect(s.layout === 'number' && s.items).toHaveLength(1);
  });

  test('compare 缺一侧就整张丢弃', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'compare', left: { title: 'A', points: ['甲'] }, atSentence: 0 },
    ])));
    expect(d.slides).toHaveLength(0);
  });

  test('flow 至少两步才成立', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'flow', steps: ['只有一步'], atSentence: 0 },
      { layout: 'flow', steps: ['一', '二'], atSentence: 1 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('points 最多 3 条', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'points', heading: 'h', points: ['1', '2', '3', '4', '5'], atSentence: 0 },
    ])));
    const s = d.slides[0]!.slide;
    expect(s.layout === 'points' && s.points).toHaveLength(3);
  });
});

describe('makeDeck 时序', () => {
  test('幻灯按 atSentence 排序', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'quote', text: 'c', atSentence: 2 },
      { layout: 'quote', text: 'a', atSentence: 0 },
      { layout: 'quote', text: 'b', atSentence: 1 },
    ])));
    expect(d.slides.map((s) => s.atSentence)).toEqual([0, 1, 2]);
  });

  test('越界的 atSentence 被钳进范围', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'quote', text: 'x', atSentence: 99 },
      { layout: 'quote', text: 'y', atSentence: -5 },
    ])));
    expect(d.slides.map((s) => s.atSentence)).toEqual([0, 2]);
  });

  test('超过这一站能放下的张数就截断', async () => {
    // A 3-minute station takes 11; the cap now follows the narration's length
    // instead of a fixed six, which left one card on screen for fifty seconds.
    const { max } = slideCount(node.estMinutes);
    const many = Array.from({ length: max + 4 }, (_, i) => ({ layout: 'quote', text: `q${i}`, atSentence: 0 }));
    expect((await makeDeck(node, notes, stub(deck(many)))).slides).toHaveLength(max);
  });
});

describe('makeDeck 输入输出', () => {
  test('没有口播稿时抛错——无声的一站没有意义', async () => {
    expect(makeDeck(node, notes, stub(JSON.stringify({ sentences: [], slides: [] })))).rejects.toThrow();
  });

  test('溯源章节的摘句进入提示词', async () => {
    const p = stub(deck([]));
    await makeDeck(node, notes, p);
    expect(p.seen[0]!.prompt).toContain('锚定是系统1的产物');
    expect(p.seen[0]!.prompt).toContain('讲清先听到的数字会绑架判断');
  });

  test('系统提示词要求金句逐字取自摘句', async () => {
    const p = stub(deck([]));
    await makeDeck(node, notes, p);
    expect(p.seen[0]!.system).toContain('一个字都不能改');
  });
});

describe('locateQuote', () => {
  const notes: readonly ChapterNote[] = [
    {
      idx: 5, title: '分支', gist: '',
      keyPoints: [],
      quotes: ['分支本质上只是一个指向提交对象的可变指针。', '这就是 Git 分支如此轻量的原因。'],
    },
    {
      idx: 12, title: '合并', gist: '',
      keyPoints: [],
      quotes: ['Git 会用两个分支的末端所指的快照以及这两个分支的共同祖先做一个三方合并。'],
    },
  ];

  test('逐字命中时指到具体那一条摘句', () => {
    expect(locateQuote('这就是 Git 分支如此轻量的原因。', notes)).toEqual({ chapter: 5, index: 1 });
  });

  test('标点与空格不同不影响匹配', () => {
    expect(locateQuote('分支本质上只是一个指向提交对象的可变指针', notes)).toEqual({ chapter: 5, index: 0 });
  });

  test('模型截掉半句仍能溯源', () => {
    expect(locateQuote('Git 会用两个分支的末端所指的快照', notes)).toEqual({ chapter: 12, index: 0 });
  });

  test('书里没有的句子不给来源——这才是要暴露的情况', () => {
    expect(locateQuote('Git 是一个分布式版本控制系统。', notes)).toBeUndefined();
  });

  test('几个字的巧合不算引用', () => {
    expect(locateQuote('分支', notes)).toBeUndefined();
  });

  test('空摘句不会被当成命中', () => {
    expect(locateQuote('随便什么', [{ idx: 0, title: 't', gist: '', keyPoints: [], quotes: [''] }]))
      .toBeUndefined();
  });
});

describe('slideCount', () => {
  test('scales with how long the station is', () => {
    // The complaint this fixes: five cards across four minutes of narration.
    expect(slideCount(4).max).toBeGreaterThan(8);
    expect(slideCount(4).min).toBeGreaterThan(slideCount(2).min);
  });

  test('a short station still gets a deck, not two cards', () => {
    expect(slideCount(1).min).toBeGreaterThanOrEqual(4);
    expect(slideCount(0).min).toBeGreaterThanOrEqual(4);
  });

  test('never asks for more than the model can place well', () => {
    expect(slideCount(30).max).toBeLessThanOrEqual(14);
  });

  test('min always leaves the model room under max', () => {
    for (const minutes of [0, 1, 2, 3, 4, 6, 10, 30]) {
      const { min, max } = slideCount(minutes);
      expect(min).toBeLessThan(max);
    }
  });
});

describe('makeDeck 图示版式', () => {
  const cell = (x: string, y: string, name: string) => ({ x, y, name, text: `${name}的说明` });
  const corners = [
    cell('low', 'low', '删除'), cell('high', 'high', '立即做'),
    cell('high', 'low', '授权'), cell('low', 'high', '计划做'),
  ];
  const quadrant = (cells: unknown[], focus: number | null = null) => ({
    layout: 'quadrant', xLow: '不紧急', xHigh: '紧急', yLow: '不重要', yHigh: '重要',
    cells, focus, atSentence: 0,
  });

  test('cycle 要 3-6 步，两步的循环不成立', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'cycle', steps: ['焦虑', '拖延'], atSentence: 0 },
      { layout: 'cycle', steps: ['提示', '渴望', '反应', '奖赏'], atSentence: 1 },
    ])));
    expect(d.slides).toHaveLength(1);
    expect(d.slides[0]!.slide.layout).toBe('cycle');
  });

  test('pyramid 至少三层，超过五层截掉', async () => {
    const levels = ['一', '二', '三', '四', '五', '六'];
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'pyramid', levels: ['上', '下'], atSentence: 0 },
      { layout: 'pyramid', levels, atSentence: 1 },
    ])));
    const s = d.slides[0]!.slide;
    expect(d.slides).toHaveLength(1);
    expect(s.layout === 'pyramid' && s.levels).toHaveLength(5);
  });

  test('quadrant 按阅读顺序排好四格，focus 跟着那一格走', async () => {
    // The model named 立即做 (its second cell) as the focus; in reading order it is top-right.
    const d = await makeDeck(node, notes, stub(deck([quadrant(corners, 1)])));
    const s = d.slides[0]!.slide;
    if (s.layout !== 'quadrant') throw new Error(s.layout);
    expect(s.cells.map((c) => c.name)).toEqual(['计划做', '立即做', '删除', '授权']);
    expect(s.focus).toBe(1);
    expect(s.x).toEqual({ low: '不紧急', high: '紧急' });
  });

  test('quadrant 缺一角或重复一角就整张丢弃', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      quadrant(corners.slice(0, 3)),
      quadrant([...corners.slice(0, 3), cell('low', 'low', '又一个')]),
    ])));
    expect(d.slides).toHaveLength(0);
  });

  test('overlap 要 2-3 个集合和交集的名字', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'overlap', sets: ['热爱'], meet: '天职', atSentence: 0 },
      { layout: 'overlap', sets: ['甲', '乙', '丙', '丁'], meet: '天职', atSentence: 0 },
      { layout: 'overlap', sets: ['热爱', '擅长'], meet: '', atSentence: 0 },
      { layout: 'overlap', sets: ['热爱', '擅长', '有人付钱'], meet: '天职', atSentence: 1 },
    ])));
    expect(d.slides).toHaveLength(1);
  });

  test('causes 要结果和至少两组原因', async () => {
    const group = (name: string) => ({ name, causes: ['一条'] });
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'causes', effect: '中断', groups: [group('环境')], atSentence: 0 },
      { layout: 'causes', effect: '', groups: [group('环境'), group('身份')], atSentence: 0 },
      { layout: 'causes', effect: '中断', groups: [group('环境'), group('身份')], atSentence: 1 },
    ])));
    expect(d.slides).toHaveLength(1);
  });
});

describe('makeDeck 焦点', () => {
  const links = [
    { from: '提示', how: '触发', to: '渴望' },
    { from: '环境', how: '提高', to: '概率' },
  ];

  test('focus 指向存在的一项时保留', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'relation', links, focus: 1, atSentence: 0 },
    ])));
    const s = d.slides[0]!.slide;
    expect(s.layout === 'relation' && s.focus).toBe(1);
  });

  test('越界、非整数或 null 的 focus 被去掉，卡片保留', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'relation', links, focus: 2, atSentence: 0 },
      { layout: 'relation', links, focus: 0.5, atSentence: 1 },
      { layout: 'relation', links, focus: null, atSentence: 2 },
    ])));
    expect(d.slides).toHaveLength(3);
    for (const { slide } of d.slides) expect('focus' in slide).toBe(false);
  });
});

describe('makeDeck 旁注', () => {
  const steps = ['提示', '渴望', '反应'];

  test('在摘句里找得到的旁注保留', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'flow', steps, aside: '锚定是系统1的产物', atSentence: 0 },
    ])));
    const s = d.slides[0]!.slide;
    expect(s.layout === 'flow' && s.aside).toBe('锚定是系统1的产物');
  });

  test('找不到出处的旁注被去掉——编的话不能以原书的口吻出现', async () => {
    const d = await makeDeck(node, notes, stub(deck([
      { layout: 'flow', steps, aside: '这是模型自己说的一句话', atSentence: 0 },
    ])));
    expect(d.slides).toHaveLength(1);
    expect('aside' in d.slides[0]!.slide).toBe(false);
  });
});

describe('makeDeck 图示材料', () => {
  test('循环、层级、象限、交集与成因都交给模型', async () => {
    const rich = [{
      ...notes[0]!,
      cycles: [{ title: '习惯回路', steps: ['提示', '渴望', '反应'] }],
      ranks: [{ title: '需求层次', levels: ['自我实现', '尊重', '生理'] }],
      quadrants: [{
        xLow: '不紧急', xHigh: '紧急', yLow: '不重要', yHigh: '重要',
        cells: [{ x: 'high' as const, y: 'high' as const, name: '立即做', text: '马上处理' }],
      }],
      overlaps: [{ sets: ['热爱', '擅长'], meet: '天职' }],
      causes: [{ effect: '中断', groups: [{ name: '环境', causes: ['看不见', '太远'] }] }],
    }];
    const provider = stub(deck([]));
    await makeDeck(node, rich, provider);

    const prompt = provider.seen[0]!.prompt;
    expect(prompt).toContain('提示 → 渴望 → 反应 → 提示');
    expect(prompt).toContain('1. 自我实现 2. 尊重 3. 生理');
    expect(prompt).toContain('(high, high) 立即做: 马上处理');
    expect(prompt).toContain('热爱 ∩ 擅长 = 天职');
    expect(prompt).toContain('中断 ← 环境: 看不见, 太远');
  });
});

/**
 * Chinese prompts — the originals, moved here unchanged.
 *
 * These are tuned. Do not "improve" the wording while refactoring: every rule
 * in the 铁律 lists is there because something went wrong without it, and the
 * cost of finding that out again is a full generation run.
 */
import { targetChars } from '../voice';
import type { NoteMaterial, Prompts } from './types';
import { systemPrompt, userPrompt } from './xml';

const block = (label: string, lines: readonly string[]): string =>
  (lines.length > 0 ? `\n  ${label}\n${lines.map((l) => `    ${l}`).join('\n')}` : '');

const RUNG_NAME = {
  quick: '知道个大概',
  brief: '抓住要点',
  solid: '真的读懂',
  full: '完整走一遍',
} as const;

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
}

export const zh: Prompts = {
  map: {
    system: systemPrompt(`你在为一本书生成逐章摘要，供后续生成学习路径使用。

除了 gist / keyPoints / quotes，还要抽取结构化材料，供后续做图表用：
- figures   正文里出现的具体数字，value 连单位一起照抄（"32 华氏度"、"3 万人"、"68%"）
- contrasts 正文里明确对立的两方，about 是对立的那个维度
- sequences 正文里有先后顺序的过程，mark 是年份/阶段/序号，正文没给就留空串
- relations 正文里明确说出的因果或影响，how 是关系本身（"导致"、"抑制"）
- cycles    正文自己闭合的循环：每一步引出下一步，最后一步回到第一步，3-6 步
- ranks     正文明确给出的排序或层级，最高一层在前，3-5 层
- quadrants 正文用两个独立维度交叉出的四种类型：每个轴的低端和高端，以及全部四格，
            每格用 x、y 标明它在 low 还是 high
- overlaps  正文说到相交的 2-3 样东西，以及正文给交集起的名字
- causes    一个结果，以及正文给出的成因，按类别分组，2-4 组

铁律：
1. 只依据我给你的正文作答。不得使用你对这本书的任何既有印象。
2. 正文里没有的内容，一个字也不要补。
3. quotes 必须是正文中逐字出现的原句，不得改写。
4. 结构化材料同样只能来自正文。**这一章没有就给空数组**——
   编一个数字或编一组对立，比少一张图表严重得多。
5. 每章独立作答，不要跨章推断。
6. 只输出 JSON。`),

    user: (chapters) => {
      const body = chapters
        .map((c) => `<章 idx="${c.idx}" 标题="${c.title}">\n${c.text}\n</章>`)
        .join('\n\n');

      return userPrompt(`以下是 ${chapters.length} 章正文。为每一章产出：
gist（1-2 句）、keyPoints（2-4 条）、quotes（1-3 句原文摘句），
以及 figures / contrasts / sequences / relations（各 0-3 组，正文里没有就给空数组），
以及 cycles / ranks / quadrants / overlaps / causes（各 0-2 组，这几类很少见，大多数章节没有）。

idx 必须原样回填，不得改动。`, body);
    },
  },

  classify: {
    system: systemPrompt('你在判定一本书属于知识类还是叙事类。只依据给出的章节摘要，不使用任何既有印象。只输出 JSON。'),
    user: (bookTitle, digest) => userPrompt(`knowledge = 传递概念、方法、论证的书（含技术书、社科、商业、self-help）
narrative = 以情节和人物推进的书（小说、传记、纪实）`, `书名：${bookTitle}\n\n章节摘要：\n${digest}`),
  },

  reduce: {
    coverage: {
      quick: '只要全书的主干论点。够在饭桌上说清这本书讲了什么就行，细节全部舍弃。',
      brief: '主干论点加上支撑它的关键论证。舍弃例子、旁支和操作细节。',
      solid: '概念、论证和代表性的例子。覆盖大部分核心章节，舍弃附录与边缘话题。',
      full: '覆盖几乎全部实质内容，允许为重要概念单独设站。仍要舍弃版权页、索引、名单这类非内容章节。',
    },

    budgetLabel: (minutes, budget) => `${duration(minutes)} · ${RUNG_NAME[budget]}`,
    fallbackStage: (n) => `第 ${n} 阶段`,

    system: (type, coverage) => {
      const shape = type === 'narrative'
        ? '这是一本叙事类的书。站点应沿故事推进：关键事件、转折、人物关系的变化。'
        : '这是一本知识类的书。站点应沿理解推进：先建立概念，再展开论证，最后落到应用。';

      return systemPrompt(`你在为一本书设计学习路径。

${shape}

取舍尺度：${coverage}

铁律：
1. 只依据我给出的章节摘要。不得使用你对这本书的任何既有印象。
2. sourceChapters 必须来自我给出的章号，不得编造。
3. 站点要有顺序感：后一站建立在前一站之上，不是摘要的平铺。
4. 不是每章一站。该合并的合并，该跳过的跳过。
5. 阶段名描述**读者此刻在做什么**（如「建立模型」「展开论证」「落到实践」），
   不要复述书的目录。路径已经重排过顺序，沿用原书结构会和实际顺序打架。
6. 预算紧时靠**砍站**，不靠把每站讲得更浅——一站讲不明白一件事就没有价值。
7. 只输出 JSON。`);
    },

    user: (r) => {
      const urgency = r.tightening
        ? `\n\n上一次产出的路径超出了预算。这次必须更狠地砍站，控制在 ${r.targetNodes} 站左右——记住是砍站，不是把每站讲浅。`
        : '';
      const [lo, hi] = r.minutesPerNode;

      return userPrompt(`以下是全书 ${r.chapterCount} 章的摘要。请设计一条学习路径。

约束：
- 目标总时长 ${r.minMinutes}–${r.maxMinutes} 分钟
- 站数建议 ${r.targetNodes} 左右，但以时长为准，不要为凑数硬拆
- 每站 estMinutes 在 ${lo}–${hi} 分钟之间
- brief 写清这一站要讲明白什么（2-3 句）
- 把站点分进约 ${r.stageCount} 个阶段，每个阶段给一个描述读者在做什么的名字。
  **每个阶段至少 2 站**——一站一个阶段等于没有分组${urgency}`, `用户选择的预算：${r.budgetLabel}\n\n${r.digest}`);
    },
  },

  slides: {
    system: systemPrompt(`你在把一站学习内容做成一组幻灯 + 一段口播。

幻灯版式：
- title   开场，只有标题和一句副标
- points  不超过 3 条核心论断
- number  实验数据或关键比例对比，2-3 组数字
- quote   原文金句
- compare A 与 B 的对照
- flow    推导链或步骤，不超过 5 步
- timeline 有先后的进程，每条带一个 mark（年份/阶段/序号），2-6 条
- matrix  A 与 B 逐项对照：每行一个维度，两边各给一句，2-4 行
- relation 明确说出的因果或影响链，from -how-> to，2-4 条
- cycle   书里闭合的循环：最后一步回到第一步，3-6 步
- pyramid 书里给出的排序，最高一层在前，3-5 层
- quadrant 两个维度交叉出四种类型：每个轴的低端和高端，以及全部四格
- overlap 相交的 2-3 样东西，以及交集的名字
- causes  一个结果和它背后的成因，2-4 组，每组 1-3 条

选错版式的情形：
- 顺序无关紧要却用 flow——那是 points
- 条目没有 mark 却用 timeline——那是 flow
- 两边回答的是同一组问题却用 compare——那是 matrix
- 两样东西只是一起出现就用 relation——书里必须说出一方作用于另一方
- 链条有终点却用 cycle——那是 flow。书里没有闭合的不是循环
- 没有排序的清单用 pyramid。顺序必须是书给的，不是你排的
- 四种类型并非两个维度交叉而来却用 quadrant
- 只是相似就用 overlap——书里必须说出交集是什么
- 只有一个原因却用 causes——那是 relation

铁律：
1. 只依据我给出的章节摘要。不得使用你对这本书或这个主题的既有知识。
2. quote 的 text 必须原样取自我给出的摘句，一个字都不能改。
3. number / timeline / matrix / relation / cycle / pyramid / quadrant / overlap / causes
   只能用我在「可用材料」里给出的 figures / sequences / contrasts / relations /
   cycles / ranks / quadrants / overlaps / causes。材料里没有对应的那一类，
   就不要用那个版式——这几个版式看起来最像"有依据"，编出来的危害也最大。
   number 的数字还必须同量纲（都是百分比，或都是人数），不同单位的数字不要放同一张。
4. 幻灯上写要点，不写完整句子。完整的话留给口播。
   每个字段的字数上限（中文按字算，英文按词长的一半算）：
   标题 20，副标 30，小标题 24，points 每条 28，
   number 的数值 6、标签 14，flow 每步 16，compare 每栏标题 10、每条 20，
   引文 100，cycle 每步 8，pyramid 每层 14，
   quadrant 轴两端各 4、格名 8、格内说明 20，overlap 每个集合 10、交集 8，
   causes 的结果 10、组名 7、每条成因 8，旁注 16。
   **超出的幻灯会被整张丢弃**，写不下就换个说法，不要硬塞。
   每个版式最多容纳上面列出的条数。材料更多时，只留口播需要的，或拆成两张；超出的部分会被截掉。
5. sentences 是口播稿，按句切分，每句以句号结束，口语化，能读出来。
   **总字数必须接近给定目标**——字数决定音频时长，写短了这一站就不到该有的长度。
6. 每张幻灯的 atSentence 指向它该出现时对应的句子下标（从 0 开始）。
7. icon 只出现在 title 和 compare 的两栏上，用来给这一站一个能认出来的标记。
   只能从给定的名字里挑，挑不到贴切的就填 null。
   **宁可不给也不要硬给**：抽象概念（复利、身份认同、锚定）没有对应的图形，
   硬套一个只会变成毫无意义的装饰。挑的是内容里真实出现的具体事物。
8. focus 是这张幻灯要让人先看的那一项：它在你给出的列表里的下标，从 0 开始
   （quadrant 按 cells，causes 按 groups）。用于 number / relation / cycle / pyramid / quadrant / causes。
   各项分量相同就填 null。**最多一个**——处处强调等于没有强调。
9. aside 是 flow / matrix / relation / cycle / pyramid / quadrant / overlap / causes 上可选的页边旁注：
   一小段从摘句里原样抄下的话，只在书里的原话能让这张图更清楚时才给，否则填 null。
   在摘句里找不到出处的旁注会被删掉。
10. 只输出 JSON。`),

    user: (r) => userPrompt(`时长约 ${r.minutes} 分钟，做 ${r.slides.min}-${r.slides.max} 张幻灯。
**幻灯要铺满整段口播**：一张幻灯对应大约 ${r.secondsPerSlide} 秒，讲到新的一层就换一张。
atSentence 要从 0 一直铺到最后一句附近，不要全挤在前三分之一。
口播稿总字数目标 ${targetChars(r.minutes, 'zh')} 字（允许 ±15%），这决定音频时长，请认真控制。`, `可用的 icon 名字（没有贴切的就填 null）：${r.iconNames.join(' ')}
这一站：${r.title}
要讲明白：${r.brief}
${r.keyPoints.length > 0 ? `要点：\n${r.keyPoints.map((k) => `- ${k}`).join('\n')}\n` : ''}

可用材料（来自这一站溯源的章节）：

${r.material}`),

    noteBlock: (n: NoteMaterial) => `[${n.idx}] ${n.title}\n  ${n.gist}`
      + block('要点', n.keyPoints)
      + block('摘句', n.quotes.map((q) => `「${q}」`))
      + block('数字', n.figures)
      + block('对立', n.contrasts)
      + block('进程', n.sequences)
      + block('因果', n.relations)
      + block('循环', n.cycles)
      + block('层级', n.ranks)
      + block('象限', n.quadrants)
      + block('交集', n.overlaps)
      + block('成因', n.causes),
  },

  recap: {
    stageTitle: '合上书',
    title: '回望这条路',
    brief: '把走过的每一站接回一条线，说清这本书最终主张什么。',

    system: systemPrompt(`你在为一次读书路径做最后一站：回望。

读者刚刚一站一站走完了这本书。这一站不引入任何新内容，只做三件事：
1. 把走过的站重新接成一条线——它们之间是什么关系，为什么是这个顺序。
2. 说清整本书最终主张什么，用一句话就能带走的那种。
3. 收尾。读者到这里是走完了，要让他知道自己走完了。

幻灯版式：
- title   开场，只有标题和一句副标
- points  不超过 3 条核心论断
- flow    把站点串成推导链或步骤，不超过 5 步
- compare A 与 B 的对照
- timeline 把走过的站按顺序排成一条线，mark 用阶段名，2-6 条

铁律：
1. 只依据我给出的站点清单。不得引入任何清单之外的内容，也不得使用你对这本书的既有印象。
2. 不要逐站复述。复述一遍等于让读者再走一次，这一站的价值在于**收束**。
3. 不要用「第 3 站讲了……」这种说法，读者记的是内容不是编号。
4. sentences 是口播稿，按句切分，每句以句号结束，口语化，能读出来。
   **总字数必须接近给定目标**——字数决定音频时长。
5. 每张幻灯的 atSentence 指向它该出现时对应的句子下标（从 0 开始）。
6. 只输出 JSON。`),

    user: (r) => userPrompt(`请做最后一站。
时长约 ${r.minutes} 分钟，做 ${r.slides.min}-${r.slides.max} 张幻灯。
口播稿总字数目标 ${targetChars(r.minutes, 'zh')} 字（允许 ±15%），这决定音频时长，请认真控制。`, `这本书：${r.bookTitle}

读者刚刚按顺序走完了下面这 ${r.stationCount} 站：

${r.walked}

最后一站标题：「${r.recapTitle}」`),
  },

  notes: {
    preamble: `这份材料不是出版的书，而是读者自己写的笔记，写笔记的人就是你正在对话的人。
下文凡说到"书"，一律理解为"这些笔记"；凡说到"作者"，一律理解为"读者本人"。不要把笔记归到某位作者名下，也不要称之为书。
对读者说话时，把对方当作笔记的作者："你在笔记里记下……""你当时写道……"。
笔记往往简短零散。某条只有片段时，宁可少讲，也不要用你已有的知识去补全。`,
    stageTitle: '回头看',
    title: '这些笔记连起来说了什么',
    brief: '把走过的每一站接回一条线，说清这些笔记合在一起，最终指向什么。',
  },

  parse: {
    untitled: '（无题）',
    opening: '开篇',
    part: (n) => `第 ${n} 部分`,
    section: (n) => `第 ${n} 节`,
    whole: '全文',
    notes: (n) => `${n} 篇笔记`,
  },
};

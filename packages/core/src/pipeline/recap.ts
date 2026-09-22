/**
 * The last station: the walk's own ending.
 *
 * A path that stops after its final chapter station ends mid-stride — the
 * reader has been handed fifteen separate things and nothing that puts them
 * back together. This station does that, and it is also the only place where
 * "you have finished this book" can be said.
 *
 * It is built from the path, not from the book. Every station already carries
 * the brief it was asked to make clear, so recapping needs no second pass over
 * the chapter notes — which keeps invariant 6 (the text is read exactly once)
 * intact. Its `sourceChapters` is the union of the stations it recaps, so the
 * provenance invariant holds here too: it cites nothing the path did not cite.
 */
import type { DraftDeck, PathNode, Stage } from '../types';
import type { LlmProvider } from '../llm/types';
import { clampNodeMinutes, type ReadingBudget, totalMinutes } from './budget';
import type { ReduceResult } from './reduce';
import { composeDeck, MAX_SLIDES, MIN_SLIDES } from './slides';
import { targetChars } from './tts';

export const RECAP_NODE_ID = 'recap';
const RECAP_STAGE_TITLE = '合上书';
const RECAP_TITLE = '回望这条路';

/** Enough stations to be worth a recap. Below this the reader still has them all in mind. */
const MIN_STATIONS = 3;

/** Roughly one minute of recap per four stations, then clamped to the budget's station length. */
function recapMinutes(stationCount: number, budget: ReadingBudget): number {
  return clampNodeMinutes(Math.round(stationCount / 4) + 1, budget);
}

/**
 * Append the recap station to a reduced path.
 *
 * Deliberately outside `reduceToPath`: reduce chooses stations from the book and
 * is judged against the budget for doing so. The recap is derived from its
 * result, and adding it there would make the budget retry fight its own output.
 * The overrun it causes is one station's worth and is reported honestly in
 * `totalMinutes`.
 */
export function withRecap(reduced: ReduceResult): ReduceResult {
  if (reduced.nodes.length < MIN_STATIONS) return reduced;

  const chapters = [...new Set(reduced.nodes.flatMap((n) => n.sourceChapters))].sort((a, b) => a - b);
  const recap: PathNode = {
    id: RECAP_NODE_ID,
    idx: reduced.nodes.length,
    title: RECAP_TITLE,
    kind: 'recap',
    brief: '把走过的每一站接回一条线，说清这本书最终主张什么。',
    keyPoints: reduced.nodes.map((n) => n.title),
    sourceChapters: chapters,
    estMinutes: recapMinutes(reduced.nodes.length, reduced.budget),
  };

  const nodes = [...reduced.nodes, recap];
  // Its own stage, and the only one-station stage there is: it belongs to no
  // phase of the walk, it is what happens after the walk.
  const stages: readonly Stage[] = [...reduced.stages, { title: RECAP_STAGE_TITLE, nodeIds: [recap.id] }];

  return { ...reduced, nodes, stages, totalMinutes: totalMinutes(nodes) };
}

export function isRecap(node: PathNode): boolean {
  return node.kind === 'recap';
}

const SYSTEM = `你在为一次读书路径做最后一站：回望。

读者刚刚一站一站走完了这本书。这一站不引入任何新内容，只做三件事：
1. 把走过的站重新接成一条线——它们之间是什么关系，为什么是这个顺序。
2. 说清整本书最终主张什么，用一句话就能带走的那种。
3. 收尾。读者到这里是走完了，要让他知道自己走完了。

幻灯版式：
- title   开场，只有标题和一句副标
- points  不超过 3 条核心论断
- flow    把站点串成推导链或步骤，不超过 5 步
- compare A 与 B 的对照
- quote   原文金句
- number  数字对比

铁律：
1. 只依据我给出的站点清单。不得引入任何清单之外的内容，也不得使用你对这本书的既有印象。
2. 不要逐站复述。复述一遍等于让读者再走一次，这一站的价值在于**收束**。
3. 不要用「第 3 站讲了……」这种说法，读者记的是内容不是编号。
4. sentences 是口播稿，按句切分，每句以句号结束，口语化，能读出来。
   **总字数必须接近给定目标**——字数决定音频时长。
5. 每张幻灯的 atSentence 指向它该出现时对应的句子下标（从 0 开始）。
6. 只输出 JSON。`;

export async function makeRecapDeck(
  node: PathNode,
  stations: readonly PathNode[],
  bookTitle: string,
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<DraftDeck> {
  return composeDeck(
    {
      nodeId: node.id,
      label: '回望这一站',
      system: SYSTEM,
      prompt: buildPrompt(node, stations, bookTitle),
    },
    provider,
    signal,
  );
}

function buildPrompt(node: PathNode, stations: readonly PathNode[], bookTitle: string): string {
  const walked = stations
    .map((s, i) => {
      const points = s.keyPoints.slice(0, 3).map((k) => `  - ${k}`).join('\n');
      return `${i + 1}. ${s.title}\n  ${s.brief}${points ? `\n${points}` : ''}`;
    })
    .join('\n\n');

  return `这本书：${bookTitle}

读者刚刚按顺序走完了下面这 ${stations.length} 站：

${walked}

请做最后一站「${RECAP_TITLE}」。
时长约 ${node.estMinutes} 分钟，做 ${MIN_SLIDES}-${MAX_SLIDES} 张幻灯。
口播稿总字数目标 ${targetChars(node.estMinutes)} 字（允许 ±15%），这决定音频时长，请认真控制。`;
}

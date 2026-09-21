/** Classify stage: decide the book's type. Reads the gists from map, never the text. */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { BookType, ChapterNote } from '../types';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['type', 'reason'],
  properties: {
    type: { type: 'string', enum: ['knowledge', 'narrative'] },
    reason: { type: 'string' },
  },
} as const;

export interface Classification {
  readonly type: BookType;
  readonly reason: string;
}

export async function classifyBook(
  title: string,
  notes: readonly ChapterNote[],
  provider: LlmProvider,
  signal?: AbortSignal,
): Promise<Classification> {
  const digest = notes
    .slice(0, 40)
    .map((n) => `${n.idx}. ${n.title}：${n.gist}`)
    .join('\n');

  const raw = await provider.complete({
    system: '你在判定一本书属于知识类还是叙事类。只依据给出的章节摘要，不使用任何既有印象。只输出 JSON。',
    prompt: `书名：${title}

章节摘要：
${digest}

knowledge = 传递概念、方法、论证的书（含技术书、社科、商业、self-help）
narrative = 以情节和人物推进的书（小说、传记、纪实）`,
    schema: SCHEMA,
    signal,
  });

  const parsed = parseJsonOutput<{ type?: string; reason?: string }>(raw);
  return {
    type: parsed.type === 'narrative' ? 'narrative' : 'knowledge',
    reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
  };
}

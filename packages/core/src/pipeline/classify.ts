/** Classify stage: decide the book's type. Reads the gists from map, never the text. */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ContentLocale } from '../parse/language';
import type { BookType, ChapterNote, SourceKind } from '../types';
import { promptsFor } from './prompts';

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
  locale: ContentLocale = 'zh',
  kind: SourceKind = 'book',
): Promise<Classification> {
  const prompts = promptsFor(locale, kind);
  const digest = notes
    .slice(0, 40)
    .map((n) => `${n.idx}. ${n.title} — ${n.gist}`)
    .join('\n');

  const raw = await provider.complete({
    label: 'classify',
    system: prompts.classify.system,
    prompt: prompts.classify.user(title, digest),
    schema: SCHEMA,
    signal,
  });

  const parsed = parseJsonOutput<{ type?: string; reason?: string }>(raw);
  return {
    type: parsed.type === 'narrative' ? 'narrative' : 'knowledge',
    reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : '',
  };
}

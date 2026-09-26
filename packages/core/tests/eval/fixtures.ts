import type { LlmProvider, LlmRequest } from '../../src/llm/types';
import type { ChapterNote, PathNode } from '../../src/types';

/** Answers by label, so parallel judge calls cannot take each other's replies. */
export const byLabel = (replies: Readonly<Record<string, string>>): LlmProvider & { seen: LlmRequest[] } => {
  const seen: LlmRequest[] = [];
  return {
    seen, name: 'stub', suggestedConcurrency: 1, overheadTokens: 0,
    async complete(r) {
      seen.push(r);
      const key = Object.keys(replies).find((k) => (r.label ?? '').startsWith(k));
      if (key === undefined) throw new Error(`no reply for ${r.label}`);
      return replies[key] ?? '';
    },
  };
};

export const notes: readonly ChapterNote[] = [0, 1, 2, 3].map((idx) => ({
  idx, title: `第${idx}章`, gist: `摘要${idx}`, keyPoints: [`要点${idx}`], quotes: [],
}));

export const station = (id: string, chapters: number[], minutes = 3): PathNode => ({
  id, idx: Number(id.slice(1)), title: `站${id}`, kind: 'concept', brief: `讲清${id}`,
  keyPoints: [], sourceChapters: chapters, estMinutes: minutes,
});

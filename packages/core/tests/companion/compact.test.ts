import { describe, expect, test } from 'bun:test';
import { compactContext, shouldCompact } from '../../src/companion/compact';
import type { ChatMessage } from '../../src/companion/types';

const turn = (number: number): ChatMessage[] => [
  { id: `u${number}`, role: 'user', text: `Question ${number}`, at: 'now' },
  { id: `t${number}`, role: 'tool', name: 'read_notes', resultId: `r${number}`, text: 'x'.repeat(300), at: 'now' },
  { id: `a${number}`, role: 'assistant', text: `Answer ${number}`, citations: [], at: 'now' },
];

describe('companion compaction', () => {
  test('trigger accounts for reserved output room', () => {
    expect(shouldCompact(720, 1000, 200)).toBe(true);
    expect(shouldCompact(400, 1000, 200)).toBe(false);
  });

  test('summarizes complete old turns and keeps recent pairs and the archive', async () => {
    const messages = [...turn(1), ...turn(2), ...turn(3)];
    let prompt = '';
    const result = await compactContext({ summary: 'Prior <goal>', retainedFrom: 0 }, messages, {
      recentTurns: 1,
      summarize: async (value) => { prompt = value; return 'Goal, conclusions, unresolved, refs'; },
    });
    expect(result).toEqual({ summary: 'Goal, conclusions, unresolved, refs', retainedFrom: 6 });
    expect(prompt).toContain('Prior &lt;goal&gt;');
    expect(prompt).toContain('result_id="r2"');
    expect(prompt).not.toContain('result_id="r3"');
    expect(messages).toHaveLength(9);
  });

  test('failed summary leaves state intact; a trailing unfinished turn remains verbatim', async () => {
    const state = { summary: 'original', retainedFrom: 0 };
    const messages = [...turn(1), ...turn(2)];
    await expect(compactContext(state, messages, {
      recentTurns: 1, summarize: async () => { throw new Error('offline'); },
    })).rejects.toThrow('offline');
    expect(state).toEqual({ summary: 'original', retainedFrom: 0 });
    expect(messages).toHaveLength(6);
    const partial = [...messages, { id: 'u3', role: 'user' as const, text: 'Pending', at: 'now' }];
    expect(await compactContext(state, partial, {
      recentTurns: 1, summarize: async () => 'Older complete turn',
    })).toEqual({ summary: 'Older complete turn', retainedFrom: 3 });
    expect(partial.slice(3).map((message) => message.id)).toEqual(['u2', 't2', 'a2', 'u3']);
  });
});

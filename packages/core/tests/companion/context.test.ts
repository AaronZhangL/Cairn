import { describe, expect, test } from 'bun:test';
import { buildContext, completeTurnBoundary, estimateTokens, retainedMessages } from '../../src/companion/context';
import type { ChatMessage } from '../../src/companion/types';

const messages: ChatMessage[] = [
  { id: 'u1', role: 'user', text: 'First', at: '2026-01-01' },
  { id: 't1', role: 'tool', name: 'read_notes', resultId: 'r1', text: '<tool_result>large</tool_result>', at: '2026-01-01' },
  { id: 'a1', role: 'assistant', text: 'Answer', citations: [], at: '2026-01-01' },
  { id: 'u2', role: 'user', text: 'Second', at: '2026-01-01' },
  { id: 'a2', role: 'assistant', text: 'Next', citations: [], at: '2026-01-01' },
];

describe('companion context', () => {
  test('cuts only at a user boundary, keeping each tool with its turn', () => {
    expect(completeTurnBoundary(messages, 2)).toBe(3);
    expect(retainedMessages(messages, 2).map((item) => item.id)).toEqual(['u2', 'a2']);
    expect(completeTurnBoundary(messages.slice(0, 4), 2)).toBe(0);
  });

  test('escapes book, shelf, summary, and conversation data in XML', () => {
    const xml = buildContext({
      path: { title: 'A & B', nodes: [{ id: 'n1', title: '</path>', brief: '"<claim>"', sourceChapters: [0] }] },
      chapters: [{ idx: 0, title: 'Chapter <1>', gist: 'a & b' }],
      shelf: [{ bookId: 'old', title: "O'Reilly", claim: '</shelf>' }],
      summary: 'Reader asked <secret> & moved on',
      messages: [{ id: 'u', role: 'user', text: 'Why </conversation>?', at: 'now' }],
      atNode: 'n1',
    });
    expect(xml).toContain('A &amp; B');
    expect(xml).toContain('&lt;/path&gt;');
    expect(xml).toContain('&quot;&lt;claim&gt;&quot;');
    expect(xml).toContain('O&apos;Reilly');
    expect(xml).toContain('Why &lt;/conversation&gt;?');
    expect(xml).not.toContain('Why </conversation>?');
  });

  test('estimates large tool content rather than excluding it', () => {
    expect(estimateTokens('x'.repeat(4000))).toBeGreaterThan(900);
  });
});

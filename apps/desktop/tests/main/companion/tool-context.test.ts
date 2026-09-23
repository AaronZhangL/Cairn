import { expect, test } from 'bun:test';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { compactToolContext, visibleToolResultIds } from '../../../src/main/companion/tool-context';

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

const assistant = (id: string): AgentMessage => ({
  role: 'assistant', api: 'openai-completions', provider: 'test', model: 'test', usage,
  stopReason: 'toolUse', timestamp: 1,
  content: [{ type: 'toolCall', id, name: 'read_chapter', arguments: { indices: [0] } }],
});
const result = (id: string, text: string): AgentMessage => ({
  role: 'toolResult', toolCallId: id, toolName: 'read_chapter', isError: false,
  content: [{ type: 'text', text }], timestamp: 2,
});

test('evicts only complete tool call/result pairs, leaving the audit transcript untouched', () => {
  const messages: AgentMessage[] = [
    { role: 'user', content: 'Question', timestamp: 0 },
    assistant('one'), result('one', `<tool_result id="result-one" source="book">${'A'.repeat(10_000)}</tool_result>`),
    assistant('two'), result('two', `<tool_result id="result-two" source="book">${'B'.repeat(10_000)}</tool_result>`),
    assistant('pending'),
  ];
  const reduced = compactToolContext(messages, 3_000);
  expect(messages).toHaveLength(6);
  expect(reduced.some((message) => message.role === 'assistant'
    && message.content.some((part) => part.type === 'toolCall' && part.id === 'pending'))).toBe(true);
  expect(reduced.some((message) => message.role === 'toolResult' && message.toolCallId === 'one')).toBe(false);
  expect(reduced.some((message) => message.role === 'assistant'
    && message.content.some((part) => part.type === 'toolCall' && part.id === 'one'))).toBe(false);
  expect(visibleToolResultIds(reduced).has('result-one')).toBe(false);
});

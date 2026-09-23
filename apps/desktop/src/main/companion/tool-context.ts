import type { AgentMessage } from '@earendil-works/pi-agent-core';
import { estimateTokens } from '@cairn/core/companion/context';
import { escapeXml } from '@cairn/core/companion/xml';

interface Group {
  readonly start: number;
  readonly end: number;
  readonly ids: readonly string[];
}

function completeGroups(messages: readonly AgentMessage[]): readonly Group[] {
  const groups: Group[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== 'assistant') continue;
    const ids = message.content.filter((part) => part.type === 'toolCall').map((part) => part.id);
    if (ids.length === 0) continue;
    const next = messages.slice(index + 1, index + 1 + ids.length);
    if (next.length !== ids.length || next.some((item, offset) =>
      item.role !== 'toolResult' || item.toolCallId !== ids[offset])) continue;
    groups.push({ start: index, end: index + 1 + ids.length, ids });
    index += ids.length;
  }
  return groups;
}

export function compactToolContext(messages: AgentMessage[], maxTokens: number): AgentMessage[] {
  const groups = completeGroups(messages);
  if (estimateTokens(JSON.stringify(messages)) <= maxTokens || groups.length === 0) return messages;
  const evicted = new Set<number>();
  const ids: string[] = [];
  for (const group of groups) {
    for (let index = group.start; index < group.end; index += 1) evicted.add(index);
    ids.push(...group.ids);
    const notice: AgentMessage = {
      role: 'user',
      content: `<evicted_tool_results>${ids.map((id) => `<id>${escapeXml(id)}</id>`).join('')}<instruction>These earlier tool results left the working context. Fetch again before using their text or citing them.</instruction></evicted_tool_results>`,
      timestamp: Date.now(),
    };
    const reduced = messages.flatMap((message, index) => index === group.start ? [notice]
      : evicted.has(index) ? [] : [message]);
    if (estimateTokens(JSON.stringify(reduced)) <= maxTokens) return reduced;
  }
  const first = groups[0];
  if (!first) return messages;
  const notice: AgentMessage = {
    role: 'user',
    content: `<evicted_tool_results>${ids.map((id) => `<id>${escapeXml(id)}</id>`).join('')}<instruction>Fetch again before using these results.</instruction></evicted_tool_results>`,
    timestamp: Date.now(),
  };
  return messages.flatMap((message, index) => index === first.start ? [notice]
    : evicted.has(index) ? [] : [message]);
}

export function visibleToolResultIds(messages: readonly AgentMessage[]): ReadonlySet<string> {
  return new Set(messages.flatMap((message) => message.role === 'toolResult'
    ? message.content.flatMap((part) => {
      if (part.type !== 'text') return [];
      const id = part.text.match(/<tool_result id="([^"]+)" source="/);
      return id?.[1] ? [id[1]] : [];
    }) : []));
}

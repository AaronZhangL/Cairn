/**
 * Answering a question the book does not cover.
 *
 * Deliberately NOT MCP. Calling one web search is a function, not a protocol —
 * MCP earns its place when many unforeseen tools must be pluggable (an Obsidian
 * vault, a Zotero library), not for a single search endpoint.
 *
 * Also deliberately not codex's own built-in search: letting the agent search on
 * its own impulse means we cannot say when it searched, what it read, or which
 * sentence came from the web. Labelling the two sources apart is the entire value
 * of this feature, so the search has to be ours to control.
 *
 * Three rules this module exists to enforce:
 *   1. The book is answered from the book. Going outside never happens silently.
 *   2. Going outside is an explicit user step, never the model's decision.
 *   3. Book-sourced and web-sourced statements are returned separately, never
 *      blended into one paragraph. The reader has not read the book and cannot
 *      otherwise tell which is which.
 */
import { type LlmProvider, parseJsonOutput } from '../llm/types';
import type { ContentLocale } from '../parse/language';
import { promptsFor } from './prompts';

export interface SearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

/** Implemented against whichever search API is chosen (Tavily / Brave / Bocha / …). */
export interface WebSearch {
  search(query: string, signal?: AbortSignal): Promise<readonly SearchResult[]>;
}

export interface OutsideAnswer {
  readonly text: string;
  /** Sources actually cited, in the order the answer refers to them. */
  readonly citations: readonly SearchResult[];
  /** True when the search turned up nothing usable. */
  readonly empty: boolean;
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['text', 'usedSources'],
  properties: {
    text: { type: 'string' },
    usedSources: { type: 'array', items: { type: 'integer' } },
  },
} as const;


export interface AskOutsideParams {
  readonly question: string;
  /** Book context used only to sharpen the query, never quoted in the answer. */
  readonly bookTitle?: string;
  readonly signal?: AbortSignal;
}

export async function askOutside(
  params: AskOutsideParams,
  search: WebSearch,
  provider: LlmProvider,
  locale: ContentLocale = 'zh',
): Promise<OutsideAnswer> {
  const prompts = promptsFor(locale);
  const query = params.bookTitle
    ? `${params.question} ${params.bookTitle}`
    : params.question;

  const results = await search.search(query, params.signal);
  if (results.length === 0) {
    return { text: prompts.outside.nothingFound, citations: [], empty: true };
  }

  const material = results
    .map((r, i) => `[${i}] ${r.title}\n${r.url}\n${r.snippet}`)
    .join('\n\n');

  const raw = await provider.complete({
    system: prompts.outside.system,
    label: 'ask:outside',
    prompt: prompts.outside.user(params.question, material),
    schema: SCHEMA,
    signal: params.signal,
  });

  const parsed = parseJsonOutput<{ text?: unknown; usedSources?: unknown }>(raw);
  const used = Array.isArray(parsed.usedSources)
    ? parsed.usedSources
        .map(Number)
        .filter((i) => Number.isInteger(i) && i >= 0 && i < results.length)
    : [];

  return {
    text: typeof parsed.text === 'string' ? parsed.text.trim() : '',
    // Cite only what was used; fall back to everything when the model named nothing
    citations: used.length > 0 ? [...new Set(used)].map((i) => results[i]!) : results,
    empty: false,
  };
}

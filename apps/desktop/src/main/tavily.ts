import type { SearchResult, WebSearch } from '@cairn/core/companion/web-search';
import { CairnError } from '@cairn/core/errors';

const ENDPOINT = 'https://api.tavily.com/search';

export function tavily(apiKey = process.env.TAVILY_API_KEY, fetcher: typeof fetch = fetch): WebSearch {
  return {
    async search(query, signal): Promise<readonly SearchResult[]> {
      if (!apiKey) throw new CairnError('tavily_key_missing');

      const res = await fetcher(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
        signal,
      });
      if (!res.ok) throw new CairnError('tavily_failed', { status: res.status });

      const body = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      return (body.results ?? [])
        .filter((r) => r.url && r.title)
        .map((r) => ({ title: r.title!, url: r.url!, snippet: (r.content ?? '').slice(0, 500) }));
    },
  };
}

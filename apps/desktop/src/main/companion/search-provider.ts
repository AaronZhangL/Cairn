import type { SearchResult, WebSearch } from '@cairn/core/companion/web-search';
import { CairnError } from '@cairn/core/errors';
import { tavily } from '../tavily';

export function webSearch(
  provider: 'brave' | 'firecrawl' | 'tavily', key?: string, fetcher: typeof fetch = fetch,
): WebSearch {
  if (provider === 'tavily') return tavily(key, fetcher);
  if (provider === 'brave') return {
    async search(query, signal): Promise<readonly SearchResult[]> {
      if (!key) throw new CairnError('brave_key_missing');
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', '5');
      url.searchParams.set('text_decorations', 'false');
      const response = await fetcher(url, {
        headers: { accept: 'application/json', 'x-subscription-token': key }, signal,
      });
      if (!response.ok) throw new CairnError('brave_failed', { status: response.status });
      const body = (await response.json()) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
      return (body.web?.results ?? [])
        .filter((item): item is { title: string; url: string; description?: string } =>
          typeof item.title === 'string' && typeof item.url === 'string')
        .map((item) => ({ title: item.title, url: item.url, snippet: item.description ?? '' }));
    },
  };
  return {
    async search(query, signal): Promise<readonly SearchResult[]> {
      const response = await fetcher('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
        body: JSON.stringify({ query, limit: 5 }),
        signal,
      });
      if (!response.ok) throw new CairnError('firecrawl_failed', { status: response.status });
      const body = (await response.json()) as { success?: boolean; data?: { web?: { title?: string; url?: string; description?: string }[] } };
      if (body.success === false) throw new CairnError('firecrawl_failed');
      return (body.data?.web ?? [])
        .filter((item): item is { title: string; url: string; description?: string } =>
          typeof item.title === 'string' && typeof item.url === 'string')
        .map((item) => ({ title: item.title, url: item.url, snippet: item.description ?? '' }));
    },
  };
}

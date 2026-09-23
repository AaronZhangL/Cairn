import { expect, test } from 'bun:test';
import { CairnError } from '@cairn/core/errors';
import { webSearch } from '../../../src/main/companion/search-provider';

test('Firecrawl search works without a key and returns web results', async () => {
  let endpoint = '';
  let options: RequestInit | undefined;
  const search = webSearch('firecrawl', undefined, async (url, init) => {
    endpoint = String(url);
    options = init;
    return Response.json({ success: true, data: { web: [
      { title: 'Official page', url: 'https://example.org/page', description: 'Useful fact' },
    ] } });
  });

  expect(await search.search('reading question')).toEqual([
    { title: 'Official page', url: 'https://example.org/page', snippet: 'Useful fact' },
  ]);
  expect(endpoint).toBe('https://api.firecrawl.dev/v2/search');
  expect(options?.method).toBe('POST');
  expect(options?.headers).toEqual({ 'content-type': 'application/json' });
  expect(JSON.parse(String(options?.body))).toEqual({ query: 'reading question', limit: 5 });
});

test('Firecrawl sends a configured key only to Firecrawl', async () => {
  let options: RequestInit | undefined;
  const search = webSearch('firecrawl', 'fire-secret', async (_url, init) => {
    options = init;
    return Response.json({ success: true, data: { web: [] } });
  });
  await search.search('reading question');
  expect(options?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer fire-secret' });
});

test('Brave selection requires its own key', async () => {
  let called = false;
  const search = webSearch('brave', undefined, async () => {
    called = true;
    return Response.json({ web: { results: [] } });
  });
  await expect(search.search('reading question')).rejects.toMatchObject({ code: 'brave_key_missing' } satisfies Partial<CairnError>);
  expect(called).toBe(false);
});

test('Brave selection sends its key and parses web results', async () => {
  let endpoint = '';
  let options: RequestInit | undefined;
  const search = webSearch('brave', 'brave-secret', async (url, init) => {
    endpoint = String(url);
    options = init;
    return Response.json({ web: { results: [
      { title: 'Book page', url: 'https://example.org/book', description: 'Book fact' },
    ] } });
  });
  expect(await search.search('book question')).toEqual([
    { title: 'Book page', url: 'https://example.org/book', snippet: 'Book fact' },
  ]);
  expect(new URL(endpoint).origin).toBe('https://api.search.brave.com');
  expect(new URL(endpoint).searchParams.get('q')).toBe('book question');
  expect(options?.headers).toEqual({ accept: 'application/json', 'x-subscription-token': 'brave-secret' });
});

test('Tavily selection never silently uses the keyless provider', async () => {
  let called = false;
  const search = webSearch('tavily', undefined, async () => {
    called = true;
    return Response.json({ results: [] });
  });
  await expect(search.search('reading question')).rejects.toMatchObject({ code: 'tavily_key_missing' } satisfies Partial<CairnError>);
  expect(called).toBe(false);
});

test('selected Tavily uses its own endpoint and configured key', async () => {
  let endpoint = '';
  let options: RequestInit | undefined;
  const search = webSearch('tavily', 'tvly-secret', async (url, init) => {
    endpoint = String(url);
    options = init;
    return Response.json({ results: [
      { title: 'Book page', url: 'https://example.org/book', content: 'Book fact' },
    ] });
  });
  expect(await search.search('book question')).toEqual([
    { title: 'Book page', url: 'https://example.org/book', snippet: 'Book fact' },
  ]);
  expect(endpoint).toBe('https://api.tavily.com/search');
  expect(options?.headers).toEqual({ 'content-type': 'application/json', authorization: 'Bearer tvly-secret' });
});

test('keyless search surfaces provider failure instead of changing destination', async () => {
  const search = webSearch('firecrawl', undefined, async () => new Response('', { status: 429 }));
  await expect(search.search('reading question')).rejects.toMatchObject({ code: 'firecrawl_failed', params: { status: 429 } });
});

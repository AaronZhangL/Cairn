import { describe, expect, test } from 'bun:test';
import { fetchWeb, searchWeb, secureFetch, WebToolError } from '../../../src/main/companion/web-tools';

describe('web tools', () => {
  test('search returns bounded results without citable page evidence', async () => {
    const result = await searchWeb('question', {
      search: async () => [{ title: 'A & B', url: 'https://example.org/a', snippet: '<short>' }],
    });
    expect(result.text).toContain('A &amp; B');
    expect(result.text).toContain('&lt;short&gt;');
    expect('evidence' in result).toBe(false);
  });

  test('fetched public page becomes citable evidence', async () => {
    const result = await fetchWeb('https://public.example/a', {
      resolveHost: async () => ['93.184.216.34'],
      fetch: async () => new Response('<html><title>A &amp; B</title><body><p>Fact &lt;here&gt;.</p></body></html>', {
        headers: { 'content-type': 'text/html' },
      }),
    });
    expect(result.text).toContain('Fact &lt;here&gt;.');
    expect(result.evidence).toEqual({
      resultId: result.resultId, source: 'web', refs: [{ url: 'https://public.example/a', title: 'A & B' }],
    });
  });

  test('rejects direct private addresses and public redirects to private addresses', async () => {
    const deps = {
      resolveHost: async () => ['93.184.216.34'],
      fetch: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }),
    };
    await expect(fetchWeb('http://127.0.0.1/private', deps)).rejects.toBeInstanceOf(WebToolError);
    await expect(fetchWeb('https://public.example/a', deps)).rejects.toBeInstanceOf(WebToolError);
  });

  test('rejects a host with any private DNS answer', async () => {
    await expect(fetchWeb('https://public.example/a', {
      resolveHost: async () => ['93.184.216.34', '10.0.0.2'],
      fetch: async () => new Response('unsafe'),
    })).rejects.toBeInstanceOf(WebToolError);
  });

  test('rejects IPv6 addresses that can encode or tunnel to private networks', async () => {
    for (const address of ['::ffff:127.0.0.1', '2002:c0a8:0101::']) {
      await expect(fetchWeb('https://public.example/a', {
        resolveHost: async () => [address], fetch: async () => new Response('unsafe'),
      })).rejects.toBeInstanceOf(WebToolError);
    }
  });

  test('passes the verified address into the fetch transport', async () => {
    let connectedAddress = '';
    await fetchWeb('https://public.example/a', {
      resolveHost: async () => ['93.184.216.34'],
      fetch: async (_url, _signal, address) => {
        connectedAddress = address;
        return new Response('okay');
      },
    });
    expect(connectedAddress).toBe('93.184.216.34');
  });

  test('pinned transport caps a large HTTP page without losing its response', async () => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0,
      fetch: () => new Response('x'.repeat(64_000), { headers: { 'content-type': 'text/plain' } }),
    });
    try {
      const response = await secureFetch(new URL(`http://public.example:${server.port}/`), new AbortController().signal, '127.0.0.1');
      expect(response.ok).toBe(true);
      expect((await response.text()).length).toBe(32_000);
    } finally {
      server.stop(true);
    }
  });
});

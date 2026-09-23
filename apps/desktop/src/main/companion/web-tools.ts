import { randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import type { EvidenceRecord } from '@cairn/core/companion/types';
import { escapeXml } from '@cairn/core/companion/xml';
import type { SearchResult, WebSearch } from '@cairn/core/companion/web-search';

const MAX_RESULTS = 5;
const MAX_PAGE_BYTES = 32_000;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 20_000;

export class WebToolError extends Error {
  constructor(readonly code: 'unsafe_url' | 'redirect_limit' | 'fetch_failed' | 'unsupported_content') {
    super(code);
    this.name = 'WebToolError';
  }
}

export interface WebToolResult {
  readonly resultId: string;
  readonly text: string;
}

export interface FetchedWebResult extends WebToolResult {
  readonly evidence: EvidenceRecord;
}

const liveResolveHost = async (host: string): Promise<readonly string[]> =>
  (await lookup(host, { all: true })).map((answer) => answer.address);

interface FetchDeps {
  readonly resolveHost?: (host: string) => Promise<readonly string[]>;
  readonly fetch?: (url: URL, signal: AbortSignal, address: string) => Promise<Response>;
}

export async function secureFetch(url: URL, signal: AbortSignal, address: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const pinned = new URL(url.href);
    pinned.hostname = isIP(address) === 6 ? `[${address}]` : address;
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(pinned, {
      method: 'GET', signal, servername: url.hostname,
      headers: { host: url.host, accept: 'text/html,text/plain,application/xhtml+xml' },
    }, async (incoming) => {
      try {
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of incoming) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(bytes.subarray(0, MAX_PAGE_BYTES - size));
          size += bytes.length;
          if (size >= MAX_PAGE_BYTES) { incoming.destroy(); break; }
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers)) {
          if (typeof value === 'string') headers.set(key, value);
        }
        resolve(new Response(Buffer.concat(chunks), { status: incoming.statusCode ?? 500, headers }));
      } catch (cause) {
        reject(cause);
      }
    });
    request.on('error', reject);
    request.end();
  });
}

function publicIp(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const parts = address.split('.').map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    const c = parts[2] ?? 0;
    return a > 0 && a < 224 && a !== 10 && a !== 127
      && !(a === 100 && b >= 64 && b <= 127)
      && !(a === 169 && b === 254)
      && !(a === 172 && b >= 16 && b <= 31)
      && !(a === 192 && (b === 0 || b === 168))
      && !(a === 198 && (b === 18 || b === 19))
      && !(a === 192 && b === 0 && c === 2)
      && !(a === 198 && b === 51 && c === 100)
      && !(a === 203 && b === 0 && c === 113);
  }
  if (kind === 6) {
    const mapped = address.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped?.[1]) return publicIp(mapped[1]);
    const lower = address.toLowerCase();
    if (lower.startsWith('2002:') || lower.startsWith('2001:0:') || lower.startsWith('2001::')) return false;
    const first = Number.parseInt(address.split(':')[0] ?? '', 16);
    return first >= 0x2000 && first <= 0x3fff && !lower.startsWith('2001:db8:');
  }
  return false;
}

async function checkedUrl(value: string, resolveHost: (host: string) => Promise<readonly string[]>): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new WebToolError('unsafe_url');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || /(^localhost$|\.localhost$|\.local$|\.internal$)/i.test(url.hostname)) {
    throw new WebToolError('unsafe_url');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(hostname) ? [hostname] : await resolveHost(hostname);
  if (addresses.length === 0 || !addresses.every(publicIp)) throw new WebToolError('unsafe_url');
  return { url, address: addresses[0] ?? '' };
}

export async function searchWeb(
  query: string,
  search: Pick<WebSearch, 'search'>,
  signal?: AbortSignal,
): Promise<WebToolResult> {
  const results: readonly SearchResult[] = (await search.search(query, signal)).slice(0, MAX_RESULTS);
  const resultId = randomUUID();
  const body = results.map((result) =>
    `<result title="${escapeXml(result.title.slice(0, 200))}" url="${escapeXml(result.url.slice(0, 2000))}">${escapeXml(result.snippet.slice(0, 500))}</result>`,
  ).join('');
  return { resultId, text: `<tool_result id="${resultId}" source="web" kind="search">${body}</tool_result>` };
}

function decodeEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/gi, (_, entity: string) => {
    switch (entity.toLowerCase()) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos':
      case '#39': return "'";
      default: return ' ';
    }
  });
}

function pageText(raw: string): { title: string; text: string } {
  const title = decodeEntities(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
  const text = decodeEntities(raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ').trim();
  return { title, text };
}

async function boundedBody(response: Response): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_PAGE_BYTES) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value.slice(0, MAX_PAGE_BYTES - size));
    size += next.value.length;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function fetchWeb(
  input: string,
  deps: FetchDeps = {},
  signal?: AbortSignal,
): Promise<FetchedWebResult> {
  const resolveHost = deps.resolveHost ?? liveResolveHost;
  const doFetch = deps.fetch ?? secureFetch;
  const controller = new AbortController();
  const onAbort = (): void => controller.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(onAbort, TIMEOUT_MS);
  try {
    let target = await checkedUrl(input, resolveHost);
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await doFetch(target.url, controller.signal, target.address);
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects === MAX_REDIRECTS) throw new WebToolError('redirect_limit');
        target = await checkedUrl(new URL(location, target.url).href, resolveHost);
        continue;
      }
      if (!response.ok) throw new WebToolError('fetch_failed');
      const contentType = response.headers.get('content-type') ?? 'text/plain';
      if (!/^(text\/html|text\/plain|application\/xhtml\+xml)/i.test(contentType)) {
        throw new WebToolError('unsupported_content');
      }
      const raw = await boundedBody(response);
      const page = contentType.startsWith('text/html') ? pageText(raw) : { title: '', text: raw };
      const title = page.title || target.url.hostname;
      const resultId = randomUUID();
      return {
        resultId,
        text: `<tool_result id="${resultId}" source="web" kind="fetch" url="${escapeXml(target.url.href)}" title="${escapeXml(title)}">${escapeXml(page.text)}</tool_result>`,
        evidence: { resultId, source: 'web', refs: [{ url: target.url.href, title }] },
      };
    }
    throw new WebToolError('redirect_limit');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

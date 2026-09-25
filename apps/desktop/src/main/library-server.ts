/**
 * Where generated books live, and how the webview reads them.
 *
 * The library cannot sit next to the app: the main process starts with its cwd
 * inside the .app bundle, and anything written there is wiped by the next build
 * and invisible to the webview, which loads from the dev server or from
 * views://. Both problems go away by putting the library in the platform's user
 * data directory and serving it over loopback.
 *
 * The server is a file reader, not a backend: it binds 127.0.0.1, exposes one
 * directory, holds no state and answers only GET. It exists because <audio>
 * needs a URL it can range-request, which an RPC reply cannot provide.
 */
import { resolve, sep } from 'node:path';
import { isBookId } from '@cairn/core/store/library';
import { DATA_DIR } from './store';

/**
 * Map a request path to a file inside the library, or nothing.
 *
 * The token is the first segment: without it any other local process could read
 * the library by guessing the port. `..` is rejected before joining and the
 * result is checked against the root again, because a decoded segment can
 * contain a separator.
 */
export function resolveInLibrary(
  root: string,
  pathname: string,
  token: string,
): string | undefined {
  const parts = pathname.split('/').filter(Boolean).map(decodeSafely);
  if (parts.length < 2 || parts[0] !== token) return undefined;

  const rel = parts.slice(1);
  if (rel.some((p) => p === undefined || p === '.' || p === '..')) return undefined;
  if (!publicPlayerFile(rel as string[])) return undefined;

  const target = resolve(root, ...(rel as string[]));
  return target.startsWith(resolve(root) + sep) ? target : undefined;
}

/** An edge-tts voice id, such as `en-US-AndrewNeural`, and nothing that could name a path. */
const VOICE_FILE = /^[a-z]{2,3}-[A-Z]{2}-[A-Za-z]+\.mp3$/;

/** Where a voice's audition is written, relative to the library root. */
export const previewFile = (voice: string): string => `.preview/${voice}.mp3`;

function publicPlayerFile(parts: readonly string[]): boolean {
  if (parts.length === 1) return parts[0] === 'books.json';
  if (parts.length === 2 && parts[0] === '.preview') return VOICE_FILE.test(parts[1] ?? '');
  if (parts[0] !== 'books' || !isBookId(parts[1] ?? '')) return false;
  if (parts.length === 3) return ['path.json', 'decks-ordered.json'].includes(parts[2] ?? '');
  if (parts.length !== 4 || !/^[A-Za-z0-9_-]+\.(json|mp3)$/.test(parts[3] ?? '')) return false;
  return (parts[2] === 'decks' && (parts[3] ?? '').endsWith('.json'))
    || (parts[2] === 'audio' && (parts[3] ?? '').endsWith('.mp3'));
}

function decodeSafely(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    // A malformed escape is not a path we serve; keep it raw and let it miss
    return part;
  }
}

interface LibraryServer {
  readonly dir: string;
  /** Base URL the webview prefixes to every book file, token included. */
  readonly base: string;
}

let running: LibraryServer | undefined;

/** Started once, on the first request for it, and left running with the app. */
export function libraryServer(): LibraryServer {
  running ??= start();
  return running;
}

function start(): LibraryServer {
  const dir = DATA_DIR;
  const token = crypto.randomUUID();

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (req) => serveFile(req, dir, token),
  });

  return { dir, base: `http://127.0.0.1:${server.port}/${token}` };
}

const NOT_FOUND = (): Response => new Response('not found', { status: 404 });

async function serveFile(req: Request, root: string, token: string): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('method not allowed', { status: 405 });
  }

  const path = resolveInLibrary(root, new URL(req.url).pathname, token);
  if (!path) return NOT_FOUND();

  const file = Bun.file(path);
  if (!(await file.exists())) return NOT_FOUND();

  // The page origin is the dev server or views://, so every read is cross-origin
  const headers: Record<string, string> = {
    'access-control-allow-origin': '*',
    'accept-ranges': 'bytes',
    // A regenerated book keeps its name; a cached copy would show the old one
    'cache-control': 'no-store',
  };

  const range = parseRange(req.headers.get('range'), file.size);
  if (!range) return new Response(file, { headers });

  const [start, end] = range;
  return new Response(file.slice(start, end + 1), {
    status: 206,
    headers: { ...headers, 'content-range': `bytes ${start}-${end}/${file.size}` },
  });
}

/** Only `bytes=a-b`, `bytes=a-` and `bytes=-n`. Anything else falls back to the whole file. */
export function parseRange(header: string | null, size: number): [number, number] | undefined {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || size === 0) return undefined;

  const [, rawStart, rawEnd] = m;
  if (rawStart === '' && rawEnd === '') return undefined;

  const start = rawStart === '' ? size - Number(rawEnd) : Number(rawStart);
  const end = rawStart === '' || rawEnd === '' ? size - 1 : Number(rawEnd);

  const from = Math.max(0, Math.min(start, size - 1));
  const to = Math.max(from, Math.min(end, size - 1));
  return [from, to];
}

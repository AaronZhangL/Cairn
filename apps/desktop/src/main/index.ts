/**
 * Electrobun main process.
 *
 * The renderer cannot spawn processes, so everything touching the model, the
 * file system or the network lives here and is reached over RPC. That boundary
 * is also the security boundary: the webview never holds a key.
 */
import { BrowserView, BrowserWindow, Updater } from 'electrobun/main';
import { handlers, onProgress } from './rpc';
import type { VibeRPC } from '../shared/schema';

const DEV_SERVER = 'http://localhost:5173';

async function viewUrl(): Promise<string> {
  if ((await Updater.localInfo.channel()) !== 'dev') return 'views://mainview/index.html';
  try {
    await fetch(DEV_SERVER, { method: 'HEAD' });
    return DEV_SERVER;
  } catch {
    return 'views://mainview/index.html';
  }
}

const rpc = BrowserView.defineRPC<VibeRPC>({ handlers: { requests: handlers, messages: {} } });

const win = new BrowserWindow({
  title: 'Vibe Reading',
  url: await viewUrl(),
  frame: { width: 1400, height: 900, x: 80, y: 60 },
  rpc,
});

// Generation runs for minutes; progress streams out rather than blocking the reply
onProgress((p) => rpc.send.progress(p));

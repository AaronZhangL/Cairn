/**
 * Electrobun main process.
 *
 * The renderer cannot spawn processes, so everything touching the model, the
 * file system or the network lives here and is reached over RPC. That boundary
 * is also the security boundary: the webview never holds a key.
 */
import { BrowserView, BrowserWindow, Updater } from 'electrobun/main';
import { handlers, onProgress, onCompanionEvent } from './rpc';
import { onDeckStatus } from './generate';
import { installMenu } from './menu';
import type { CairnRPC } from '../shared/schema';

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

// Without an application menu macOS has nowhere to route ⌘C / ⌘V / ⌘A. The
// language is the default until the webview reports the reader's choice.
installMenu();

const rpc = BrowserView.defineRPC<CairnRPC>({ handlers: { requests: handlers, messages: {} } });

const win = new BrowserWindow({
  title: 'Cairn',
  url: await viewUrl(),
  frame: { width: 1400, height: 900, x: 80, y: 60 },
  rpc,
});

// Generation runs for minutes; progress streams out rather than blocking the reply
onProgress((p) => rpc.send.progress(p));
onCompanionEvent((event) => rpc.send.companion(event));

// Stations keep arriving after that modal has closed — the reader is already walking
onDeckStatus((s) => rpc.send.deckStatus(s));

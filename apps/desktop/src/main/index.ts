/**
 * Electrobun main process, and its composition root: every process-scoped
 * object is built here and passed to what needs it. Nothing else constructs a
 * builder or holds a setter for the window.
 *
 * The renderer cannot spawn processes, so everything touching the model, the
 * file system or the network lives in this process and is reached over RPC.
 * That is also the security boundary: the webview never holds a key.
 */
import { BrowserView, BrowserWindow, Updater } from 'electrobun/main';
import { createBookBuilder } from '@cairn/core/books/builder';
import { edgeTtsNarrator } from '@cairn/core/runtime';
import { createHandlers } from './rpc';
import { installMenu } from './menu';
import { providerFor } from './provider';
import { readSettings } from './settings';
import { library } from './store';
import { voiceFor } from '../shared/settings';
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

// Messages go out through the window's RPC, which exists only once the
// handlers do; these are only ever called after that.
const send = (): typeof rpc.send => rpc.send;

const books = createBookBuilder({
  library,
  narrator: edgeTtsNarrator(),
  providerFor,
  voiceFor: async (language) => voiceFor(await readSettings(), language).voice,
  // Stations keep arriving after the progress modal has closed
  onDeckStatus: (status) => send().deckStatus(status),
});

const handlers = createHandlers({
  books,
  emit: {
    progress: (p) => send().progress(p),
    companion: (event) => send().companion(event),
  },
});

const rpc = BrowserView.defineRPC<CairnRPC>({ handlers: { requests: handlers, messages: {} } });

new BrowserWindow({
  title: 'Cairn',
  url: await viewUrl(),
  frame: { width: 1400, height: 900, x: 80, y: 60 },
  rpc,
});

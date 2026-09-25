/**
 * Electrobun main process, and its composition root: every process-scoped
 * object is built here and passed to what needs it. Nothing else constructs a
 * builder or holds a setter for the window.
 *
 * The renderer cannot spawn processes, so everything touching the model, the
 * file system or the network lives in this process and is reached over RPC.
 * That is also the security boundary: the webview never holds a key.
 */
import { ApplicationMenu, BrowserView, BrowserWindow, Updater } from 'electrobun/main';
import { createBookBuilder } from '@cairn/core/books/builder';
import { edgeTtsNarrator } from '@cairn/core/runtime';
import { createHandlers } from './rpc';
import { installMenu, OPEN_SETTINGS, OPEN_INSPECTOR } from './menu';
import { providerFor } from './provider';
import { readSettings } from './settings';
import { library } from './store';
import { voiceFor, type UiLocale } from '../shared/settings';
import type { CairnRPC } from '../shared/schema';

const DEV_SERVER = 'http://localhost:5173';

const devBuild = (await Updater.localInfo.channel()) === 'dev';
const menu = (locale?: UiLocale): void => installMenu(locale, { inspector: devBuild });

async function viewUrl(): Promise<string> {
  if (!devBuild) return 'views://mainview/index.html';
  try {
    await fetch(DEV_SERVER, { method: 'HEAD' });
    return DEV_SERVER;
  } catch {
    return 'views://mainview/index.html';
  }
}

// Without an application menu macOS has nowhere to route ⌘C / ⌘V / ⌘A. The
// language is the default until the webview reports the reader's choice.
menu();

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
  menu,
  emit: {
    progress: (p) => send().progress(p),
    companion: (event) => send().companion(event),
  },
});

ApplicationMenu.on('application-menu-clicked', (event) => {
  const action = (event as { data?: { action?: string } }).data?.action;
  if (action === OPEN_SETTINGS) send().openSettings(null);
  // Open, never toggle: Electrobun's toggle crashes the process on the closing call
  if (action === OPEN_INSPECTOR) mainWindow.webview?.openDevTools();
});

const rpc = BrowserView.defineRPC<CairnRPC>({ handlers: { requests: handlers, messages: {} } });

const mainWindow = new BrowserWindow({
  title: 'Cairn',
  url: await viewUrl(),
  frame: { width: 1400, height: 900, x: 80, y: 60 },
  rpc,
});

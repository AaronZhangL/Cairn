/**
 * The application menu.
 *
 * Without one, macOS has nowhere to send ⌘C / ⌘V / ⌘A: text in the webview
 * highlights but will not copy, and the question box will not take a paste. The
 * roles here map to the native editing selectors, so the work is done by the
 * system rather than by us intercepting keys.
 *
 * The menu is drawn by the OS, so it is the one surface the renderer's own
 * dictionary cannot reach — these labels have to live in the main process, and
 * the webview tells it which language to use (`setMenuLocale`).
 */
import { ApplicationMenu } from 'electrobun/main';
import type { UiLocale } from '../shared/settings';

const APP_NAME = 'Cairn';

interface MenuWords {
  readonly about: (app: string) => string;
  readonly hide: (app: string) => string;
  readonly hideOthers: string;
  readonly showAll: string;
  readonly quit: (app: string) => string;
  readonly edit: string;
  readonly undo: string;
  readonly redo: string;
  readonly cut: string;
  readonly copy: string;
  readonly paste: string;
  readonly pasteMatch: string;
  readonly selectAll: string;
  readonly window: string;
  readonly minimize: string;
  readonly zoom: string;
  readonly fullScreen: string;
  readonly close: string;
  readonly settings: string;
}

const WORDS: Readonly<Record<UiLocale, MenuWords>> = {
  en: {
    about: (app) => `About ${app}`,
    hide: (app) => `Hide ${app}`,
    hideOthers: 'Hide Others',
    showAll: 'Show All',
    quit: (app) => `Quit ${app}`,
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    pasteMatch: 'Paste and Match Style',
    selectAll: 'Select All',
    window: 'Window',
    minimize: 'Minimize',
    zoom: 'Zoom',
    fullScreen: 'Toggle Full Screen',
    close: 'Close Window',
    settings: 'Settings…',
  },
  zh: {
    about: (app) => `关于 ${app}`,
    hide: (app) => `隐藏 ${app}`,
    hideOthers: '隐藏其他',
    showAll: '全部显示',
    quit: (app) => `退出 ${app}`,
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '拷贝',
    paste: '粘贴',
    pasteMatch: '粘贴并匹配样式',
    selectAll: '全选',
    window: '窗口',
    minimize: '最小化',
    zoom: '缩放',
    fullScreen: '全屏',
    close: '关闭窗口',
    settings: '设置…',
  },
};

/**
 * Re-callable: switching the interface language rebuilds the menu in place,
 * rather than waiting for the next launch.
 *
 * ⌘, is handled by the webview, which owns the panel. The item is here so the
 * shortcut is discoverable where macOS users look for it; it carries no action
 * of its own and the accelerator reaches the page.
 */
export function installMenu(locale: UiLocale = 'en'): void {
  const w = WORDS[locale];

  ApplicationMenu.setApplicationMenu([
    {
      label: APP_NAME,
      submenu: [
        { label: w.about(APP_NAME), role: 'about' },
        { type: 'divider' },
        { label: w.settings, accelerator: 'Cmd+,' },
        { type: 'divider' },
        { label: w.hide(APP_NAME), role: 'hide', accelerator: 'Cmd+H' },
        { label: w.hideOthers, role: 'hideOthers', accelerator: 'Cmd+Alt+H' },
        { label: w.showAll, role: 'showAll' },
        { type: 'divider' },
        { label: w.quit(APP_NAME), role: 'quit', accelerator: 'Cmd+Q' },
      ],
    },
    {
      label: w.edit,
      submenu: [
        { label: w.undo, role: 'undo', accelerator: 'Cmd+Z' },
        { label: w.redo, role: 'redo', accelerator: 'Cmd+Shift+Z' },
        { type: 'divider' },
        { label: w.cut, role: 'cut', accelerator: 'Cmd+X' },
        { label: w.copy, role: 'copy', accelerator: 'Cmd+C' },
        { label: w.paste, role: 'paste', accelerator: 'Cmd+V' },
        { label: w.pasteMatch, role: 'pasteAndMatchStyle', accelerator: 'Cmd+Shift+V' },
        { label: w.selectAll, role: 'selectAll', accelerator: 'Cmd+A' },
      ],
    },
    {
      label: w.window,
      submenu: [
        { label: w.minimize, role: 'minimize', accelerator: 'Cmd+M' },
        { label: w.zoom, role: 'zoom' },
        { label: w.fullScreen, role: 'toggleFullScreen', accelerator: 'Cmd+Ctrl+F' },
        { type: 'divider' },
        { label: w.close, role: 'close', accelerator: 'Cmd+W' },
      ],
    },
  ]);
}

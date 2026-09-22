/**
 * The application menu.
 *
 * Without one, macOS has nowhere to send ⌘C / ⌘V / ⌘A: text in the webview
 * highlights but will not copy, and the question box will not take a paste. The
 * roles here map to the native editing selectors, so the work is done by the
 * system rather than by us intercepting keys.
 */
import { ApplicationMenu } from 'electrobun/main';

const APP_NAME = 'Cairn';

export function installMenu(): void {
  ApplicationMenu.setApplicationMenu([
    {
      label: APP_NAME,
      submenu: [
        { label: `关于 ${APP_NAME}`, role: 'about' },
        { type: 'divider' },
        { label: `隐藏 ${APP_NAME}`, role: 'hide', accelerator: 'Cmd+H' },
        { label: '隐藏其他', role: 'hideOthers', accelerator: 'Cmd+Alt+H' },
        { label: '全部显示', role: 'showAll' },
        { type: 'divider' },
        { label: `退出 ${APP_NAME}`, role: 'quit', accelerator: 'Cmd+Q' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo', accelerator: 'Cmd+Z' },
        { label: '重做', role: 'redo', accelerator: 'Cmd+Shift+Z' },
        { type: 'divider' },
        { label: '剪切', role: 'cut', accelerator: 'Cmd+X' },
        { label: '拷贝', role: 'copy', accelerator: 'Cmd+C' },
        { label: '粘贴', role: 'paste', accelerator: 'Cmd+V' },
        { label: '粘贴并匹配样式', role: 'pasteAndMatchStyle', accelerator: 'Cmd+Shift+V' },
        { label: '全选', role: 'selectAll', accelerator: 'Cmd+A' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize', accelerator: 'Cmd+M' },
        { label: '缩放', role: 'zoom' },
        { label: '全屏', role: 'toggleFullScreen', accelerator: 'Cmd+Ctrl+F' },
        { type: 'divider' },
        { label: '关闭窗口', role: 'close', accelerator: 'Cmd+W' },
      ],
    },
  ]);
}

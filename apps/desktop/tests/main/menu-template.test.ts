import { describe, expect, test } from 'bun:test';
import type { ApplicationMenuItemConfig } from 'electrobun/main';
import { menuTemplate, OPEN_INSPECTOR, OPEN_SETTINGS } from '../../src/main/menu-template';

type Item = { role?: string; action?: string; accelerator?: string; submenu?: Item[] };

const items = (menu: ApplicationMenuItemConfig[]): Item[] =>
  (menu as Item[]).flatMap((top) => [top, ...(top.submenu ?? [])]);

const byRole = (menu: ApplicationMenuItemConfig[], role: string): Item | undefined =>
  items(menu).find((i) => i.role === role);

describe('menuTemplate', () => {
  test('Windows shortcuts are spelled with Ctrl, never Cmd', () => {
    const accelerators = items(menuTemplate('en', { inspector: true }, 'win32'))
      .map((i) => i.accelerator)
      .filter((a): a is string => a !== undefined);
    expect(accelerators.length).toBeGreaterThan(0);
    expect(accelerators.filter((a) => /cmd|command/i.test(a))).toEqual([]);
  });

  // Windows maps Cmd and Ctrl to one flag, so ⌘⌃F became Ctrl+F there
  test('no two Windows items share a shortcut', () => {
    const accelerators = items(menuTemplate('en', { inspector: true }, 'win32'))
      .flatMap((i) => (i.accelerator ? [i.accelerator.toLowerCase()] : []));
    expect(new Set(accelerators).size).toBe(accelerators.length);
  });

  test('Windows leaves out roles with no native action there', () => {
    const win = menuTemplate('en', {}, 'win32');
    for (const role of ['about', 'hide', 'hideOthers', 'showAll', 'pasteAndMatchStyle']) {
      expect(byRole(win, role)).toBeUndefined();
    }
    expect(byRole(win, 'redo')?.accelerator).toBe('Ctrl+Y');
  });

  test('settings keeps its action on both platforms', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      expect(items(menuTemplate('zh', {}, platform)).some((i) => i.action === OPEN_SETTINGS)).toBe(true);
    }
  });

  test('the inspector appears only when asked for', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      const has = (inspector: boolean): boolean =>
        items(menuTemplate('en', { inspector }, platform)).some((i) => i.action === OPEN_INSPECTOR);
      expect([has(true), has(false)]).toEqual([true, false]);
    }
  });

  test('macOS keeps its own menu', () => {
    const mac = menuTemplate('en', {}, 'darwin');
    expect(byRole(mac, 'hide')?.accelerator).toBe('Cmd+H');
    expect(byRole(mac, 'redo')?.accelerator).toBe('Cmd+Shift+Z');
  });
});

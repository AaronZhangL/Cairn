import { describe, expect, test } from 'bun:test';
import { shortcutsFor } from '../src/shortcut';

const key = (k: string, mods: { metaKey?: boolean; ctrlKey?: boolean }) =>
  ({ key: k, metaKey: false, ctrlKey: false, ...mods });

describe('shortcutsFor', () => {
  test('macOS listens for ⌘, not Ctrl', () => {
    const mac = shortcutsFor(true);
    expect(mac.matches(key('b', { metaKey: true }), 'b')).toBe(true);
    expect(mac.matches(key('b', { ctrlKey: true }), 'b')).toBe(false);
    expect(mac.label(',')).toBe('⌘,');
  });

  test('Windows listens for Ctrl, not the Windows key', () => {
    const win = shortcutsFor(false);
    expect(win.matches(key('j', { ctrlKey: true }), 'j')).toBe(true);
    expect(win.matches(key('j', { metaKey: true }), 'j')).toBe(false);
    expect(win.label('b')).toBe('Ctrl+B');
  });
});

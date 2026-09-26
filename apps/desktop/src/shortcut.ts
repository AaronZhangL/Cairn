/** The shell's own shortcuts: ⌘ on macOS, Ctrl everywhere else. */
export interface Shortcuts {
  readonly matches: (e: Pick<KeyboardEvent, 'metaKey' | 'ctrlKey' | 'key'>, key: string) => boolean;
  readonly label: (key: string) => string;
}

export function shortcutsFor(mac: boolean): Shortcuts {
  return {
    matches: (e, key) => (mac ? e.metaKey : e.ctrlKey) && e.key === key,
    label: (key) => (mac ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`),
  };
}

export const shortcuts = shortcutsFor(/Mac/.test(navigator.platform));

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_SHELL_SETTINGS, parseSettings, redactSettings, REDACTED_SECRET,
  type ShellSettingsValues,
} from '../shared/settings';

export function createSettingsStore(root: string) {
  const file = join(root, 'settings.json');
  let cached: ShellSettingsValues | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<ShellSettingsValues> => {
    if (cached) return cached;
    try {
      cached = parseSettings(JSON.parse(await readFile(file, 'utf8')));
    } catch {
      cached = DEFAULT_SHELL_SETTINGS;
    }
    return cached;
  };

  const write = (patch: Partial<ShellSettingsValues>): Promise<ShellSettingsValues> => {
    const nextWrite = queue.then(async () => {
      const current = await read();
      const model = patch.model && {
        ...patch.model,
        apiKey: patch.model.apiKey === REDACTED_SECRET
          ? current.model.apiKey : patch.model.apiKey,
      };
      const chatModel = patch.chatModel && {
        ...patch.chatModel,
        apiKey: patch.chatModel.apiKey === REDACTED_SECRET
          ? patch.chatModel.source === current.chatModel.source ? current.chatModel.apiKey : ''
          : patch.chatModel.apiKey,
      };
      const next = parseSettings({
        ...current, ...patch,
        ...(model ? { model } : {}),
        ...(chatModel ? { chatModel } : {}),
        tavilyKey: patch.tavilyKey === REDACTED_SECRET ? current.tavilyKey : patch.tavilyKey,
      }, current);
      await writeFile(file, JSON.stringify(next, null, 2));
      cached = next;
      return next;
    });
    queue = nextWrite.catch(() => undefined);
    return nextWrite;
  };

  return {
    read,
    readForRenderer: async (): Promise<ShellSettingsValues> => redactSettings(await read()),
    write,
  };
}

/**
 * The settings that live on disk, beside the library rather than inside the app.
 *
 * `~/Library/Application Support/Cairn/settings.json`, for the same reason the
 * books are there: the app's working directory is rebuilt on every
 * `electrobun dev`, so anything written beside the binary is gone by the next
 * launch.
 *
 * Environment variables still win where they always did. `CAIRN_TRACE=1` and
 * `TAVILY_API_KEY` were the only way to set these before this file existed, and
 * a machine configured that way should not silently start ignoring them.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_SHELL_SETTINGS, parseSettings, type ShellSettingsValues,
} from '../shared/settings';
import { DATA_DIR } from './store';

const FILE = join(DATA_DIR, 'settings.json');

let cached: ShellSettingsValues | undefined;

/** One chain, as the library index has: two writes racing lose one of them. */
let queue: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work);
  queue = next.catch(() => undefined);
  return next;
}

export async function readSettings(): Promise<ShellSettingsValues> {
  if (cached) return cached;
  try {
    cached = parseSettings(JSON.parse(await readFile(FILE, 'utf8')));
  } catch {
    // No file yet, or one this build cannot read. Either way the defaults work.
    cached = DEFAULT_SHELL_SETTINGS;
  }
  return cached;
}

export function writeSettings(patch: Partial<ShellSettingsValues>): Promise<ShellSettingsValues> {
  return serialize(async () => {
    const current = await readSettings();
    const next = parseSettings({ ...current, ...patch }, current);
    await writeFile(FILE, JSON.stringify(next, null, 2));
    cached = next;
    return next;
  });
}

/**
 * The key actually used for a search.
 *
 * A key typed into the panel wins over the environment, because it is the more
 * recent and more deliberate of the two. An empty field means "use the
 * environment", not "use nothing" — which is why the panel's hint says so.
 */
export async function effectiveTavilyKey(): Promise<string | undefined> {
  const { tavilyKey } = await readSettings();
  return tavilyKey.trim() || process.env.TAVILY_API_KEY || undefined;
}

/** Either switch turns tracing on; the environment cannot be overridden to off. */
export async function tracingOn(): Promise<boolean> {
  return process.env.CAIRN_TRACE === '1' || (await readSettings()).trace;
}

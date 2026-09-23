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
import { DATA_DIR } from './store';
import { createSettingsStore } from './settings-store';
import type { ShellSettingsValues } from '../shared/settings';

const settingsStore = createSettingsStore(DATA_DIR);
export const readSettings = settingsStore.read;
export const readSettingsForRenderer = settingsStore.readForRenderer;
export const writeSettings = settingsStore.write;

/** A saved key takes precedence over the selected provider's environment key. */
export function effectiveSearchKey(
  settings: ShellSettingsValues,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (settings.searchProvider === 'brave') return settings.braveKey.trim() || env.BRAVE_SEARCH_API_KEY || undefined;
  if (settings.searchProvider === 'firecrawl') return settings.firecrawlKey.trim() || env.FIRECRAWL_API_KEY || undefined;
  return settings.tavilyKey.trim() || env.TAVILY_API_KEY || undefined;
}

/** Either switch turns tracing on; the environment cannot be overridden to off. */
export async function tracingOn(): Promise<boolean> {
  return process.env.CAIRN_TRACE === '1' || (await readSettings()).trace;
}

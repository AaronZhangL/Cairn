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

const settingsStore = createSettingsStore(DATA_DIR);
export const readSettings = settingsStore.read;
export const readSettingsForRenderer = settingsStore.readForRenderer;
export const writeSettings = settingsStore.write;

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

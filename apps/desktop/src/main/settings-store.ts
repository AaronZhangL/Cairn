import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_SHELL_SETTINGS, parseSettings, type ProviderId, type ProviderProfile,
  type ProviderProfiles, redactSettings, REDACTED_SECRET, type ShellSettingsValues,
} from '../shared/settings';

/**
 * Merge a patch's provider profiles over the stored ones.
 *
 * Two rules, and both exist because the renderer never holds a real key. A
 * profile the patch does not mention is kept, so editing OpenAI cannot wipe
 * Anthropic. And a key that comes back as the stand-in means "unchanged", so
 * saving any other field does not erase the secret behind it.
 *
 * The old shape had one key field per role, so switching vendors had to drop it.
 * Per-provider profiles retire that hazard: each vendor's key has its own home.
 */
function mergeProviders(current: ProviderProfiles, patch: ProviderProfiles): ProviderProfiles {
  const out: Partial<Record<ProviderId, ProviderProfile>> = { ...current };
  for (const [id, profile] of Object.entries(patch) as [ProviderId, ProviderProfile][]) {
    out[id] = {
      ...profile,
      apiKey: profile.apiKey === REDACTED_SECRET ? current[id]?.apiKey ?? '' : profile.apiKey,
    };
  }
  return out;
}

export function createSettingsStore(root: string, tavilyEnvKey = process.env.TAVILY_API_KEY) {
  const file = join(root, 'settings.json');
  const fallback = tavilyEnvKey ? { ...DEFAULT_SHELL_SETTINGS, searchProvider: 'tavily' as const } : DEFAULT_SHELL_SETTINGS;
  let cached: ShellSettingsValues | undefined;
  let queue: Promise<unknown> = Promise.resolve();

  const read = async (): Promise<ShellSettingsValues> => {
    if (cached) return cached;
    try {
      cached = parseSettings(JSON.parse(await readFile(file, 'utf8')), fallback);
    } catch {
      cached = fallback;
    }
    return cached;
  };

  const write = (patch: Partial<ShellSettingsValues>): Promise<ShellSettingsValues> => {
    const nextWrite = queue.then(async () => {
      const current = await read();
      const next = parseSettings({
        ...current, ...patch,
        ...(patch.providers ? { providers: mergeProviders(current.providers, patch.providers) } : {}),
        tavilyKey: patch.tavilyKey === REDACTED_SECRET ? current.tavilyKey : patch.tavilyKey,
        braveKey: patch.braveKey === REDACTED_SECRET ? current.braveKey : patch.braveKey,
        firecrawlKey: patch.firecrawlKey === REDACTED_SECRET ? current.firecrawlKey : patch.firecrawlKey,
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

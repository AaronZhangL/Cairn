/**
 * The model providers the settings panel offers, built from pi-ai's own catalog.
 *
 * The catalog is plain data — `flattenModelCatalog` is one `Object.assign` — so
 * reading it costs nothing and needs no pi-ai runtime. Importing it rather than
 * hand-writing a table matters for one field in particular: whether a model can
 * be held to a JSON Schema server-side. Guessing that per vendor was how this
 * table would have gone stale, and a wrong guess is a book's worth of calls
 * treating the schema as a suggestion.
 *
 * Note the two spellings. OpenAI-shaped APIs report `supportsStrictMode`;
 * Anthropic reports `supportsStrictTools`. Reading only the first marks every
 * Claude model as unconstrained.
 */
import { ANTHROPIC_MODELS } from '@earendil-works/pi-ai/providers/anthropic.models';
import { DEEPSEEK_MODELS } from '@earendil-works/pi-ai/providers/deepseek.models';
import { GOOGLE_MODELS } from '@earendil-works/pi-ai/providers/google.models';
import { GROQ_MODELS } from '@earendil-works/pi-ai/providers/groq.models';
import { MINIMAX_CN_MODELS } from '@earendil-works/pi-ai/providers/minimax-cn.models';
import { MINIMAX_MODELS } from '@earendil-works/pi-ai/providers/minimax.models';
import { MOONSHOTAI_MODELS } from '@earendil-works/pi-ai/providers/moonshotai.models';
import { OPENAI_MODELS } from '@earendil-works/pi-ai/providers/openai.models';
import { OPENROUTER_MODELS } from '@earendil-works/pi-ai/providers/openrouter.models';
import { XAI_MODELS } from '@earendil-works/pi-ai/providers/xai.models';

export const PROVIDER_IDS = [
  'openai', 'anthropic', 'google', 'deepseek', 'openrouter',
  'groq', 'xai', 'moonshotai', 'minimax', 'minimax-cn', 'custom',
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export interface ProviderModel {
  readonly id: string;
  /** A proper noun — never translated. */
  readonly name: string;
  /** pi-ai's api id; decides how a forced tool call is spelled. */
  readonly api: string;
  readonly maxTokens: number;
  readonly contextWindow: number;
  /** Whether the provider will hold the reply to a JSON Schema server-side. */
  readonly strict: boolean;
}

export interface Provider {
  readonly id: ProviderId;
  readonly label: string;
  readonly getKeyUrl: string;
  readonly faviconDomain: string;
  readonly baseUrl: string;
  /** The environment variable pi-ai reads this vendor's key from. `custom` has none. */
  readonly envKey?: string;
  /** Only `custom` has no endpoint of its own. */
  readonly needsBaseUrl: boolean;
  readonly models: readonly ProviderModel[];
}

/**
 * What the catalog cannot know: where a human goes for a key, and which model to
 * start on. The catalog lists models but does not rank them, and its first
 * constrained entry alphabetically is `gpt-4` — old and dear. These are picked for
 * a station's worth of structured output: fast, current, cheap enough to run a
 * hundred times per book. `providers.test.ts` fails if a pi-ai upgrade retires one.
 */
interface Chrome {
  readonly label: string;
  readonly getKeyUrl: string;
  readonly faviconDomain: string;
  readonly defaultModel: string;
  readonly envKey?: string;
}

const CHROME: Readonly<Record<ProviderId, Chrome>> = {
  openai: { label: 'OpenAI', getKeyUrl: 'https://platform.openai.com/api-keys', faviconDomain: 'openai.com', defaultModel: 'gpt-5.4-mini', envKey: 'OPENAI_API_KEY' },
  anthropic: { label: 'Anthropic', getKeyUrl: 'https://console.anthropic.com/settings/keys', faviconDomain: 'anthropic.com', defaultModel: 'claude-haiku-4-5', envKey: 'ANTHROPIC_API_KEY' },
  google: { label: 'Google', getKeyUrl: 'https://aistudio.google.com/apikey', faviconDomain: 'ai.google.dev', defaultModel: 'gemini-3.5-flash', envKey: 'GEMINI_API_KEY' },
  deepseek: { label: 'DeepSeek', getKeyUrl: 'https://platform.deepseek.com/api_keys', faviconDomain: 'deepseek.com', defaultModel: 'deepseek-flash', envKey: 'DEEPSEEK_API_KEY' },
  openrouter: { label: 'OpenRouter', getKeyUrl: 'https://openrouter.ai/keys', faviconDomain: 'openrouter.ai', defaultModel: 'google/gemini-2.5-flash', envKey: 'OPENROUTER_API_KEY' },
  groq: { label: 'Groq', getKeyUrl: 'https://console.groq.com/keys', faviconDomain: 'groq.com', defaultModel: 'llama-3.3-70b-versatile', envKey: 'GROQ_API_KEY' },
  xai: { label: 'xAI', getKeyUrl: 'https://console.x.ai', faviconDomain: 'x.ai', defaultModel: 'grok-4.7', envKey: 'XAI_API_KEY' },
  moonshotai: { label: 'Moonshot', getKeyUrl: 'https://platform.moonshot.cn/console/api-keys', faviconDomain: 'moonshot.cn', defaultModel: 'kimi-k2.6', envKey: 'MOONSHOT_API_KEY' },
  minimax: { label: 'MiniMax', getKeyUrl: 'https://www.minimax.io/platform/user-center/basic-information', faviconDomain: 'minimax.io', defaultModel: 'MiniMax-M2.7', envKey: 'MINIMAX_API_KEY' },
  'minimax-cn': { label: 'MiniMax 中国', getKeyUrl: 'https://platform.minimaxi.com/user-center/basic-information', faviconDomain: 'minimaxi.com', defaultModel: 'MiniMax-M2.7', envKey: 'MINIMAX_CN_API_KEY' },
  custom: { label: 'Custom', getKeyUrl: '', faviconDomain: '', defaultModel: '' },
};

/** A catalog entry, as far as this file reads it. The rest of `Model` is pi-ai's business. */
interface CatalogEntry {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly api?: unknown;
  readonly baseUrl?: unknown;
  readonly maxTokens?: unknown;
  readonly contextWindow?: unknown;
  readonly compat?: { readonly supportsStrictMode?: unknown; readonly supportsStrictTools?: unknown };
}

const CATALOGS: Readonly<Partial<Record<ProviderId, Readonly<Record<string, CatalogEntry>>>>> = {
  openai: OPENAI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  google: GOOGLE_MODELS,
  deepseek: DEEPSEEK_MODELS,
  openrouter: OPENROUTER_MODELS,
  groq: GROQ_MODELS,
  xai: XAI_MODELS,
  moonshotai: MOONSHOTAI_MODELS,
  minimax: MINIMAX_MODELS,
  'minimax-cn': MINIMAX_CN_MODELS,
};

/** pi-ai decides Gemini by model id, not by a catalog flag (`supportsGoogleStrictToolSampling`). */
const GEMINI_STRICT = /^gemini(?:-live)?-([3-9]|\d{2,})/i;

function toModel(id: string, entry: CatalogEntry): ProviderModel {
  const compat = entry.compat ?? {};
  const api = typeof entry.api === 'string' ? entry.api : 'openai-completions';
  return {
    id,
    name: typeof entry.name === 'string' ? entry.name : id,
    api,
    maxTokens: typeof entry.maxTokens === 'number' ? entry.maxTokens : 4096,
    contextWindow: typeof entry.contextWindow === 'number' ? entry.contextWindow : 8192,
    strict: api === 'google-generative-ai'
      ? GEMINI_STRICT.test(id)
      : compat.supportsStrictMode === true || compat.supportsStrictTools === true,
  };
}

function baseUrlOf(catalog: Readonly<Record<string, CatalogEntry>> | undefined): string {
  for (const entry of Object.values(catalog ?? {})) {
    if (typeof entry.baseUrl === 'string' && entry.baseUrl) return entry.baseUrl;
  }
  return '';
}

export const PROVIDERS: readonly Provider[] = PROVIDER_IDS.map((id) => {
  const catalog = CATALOGS[id];
  return {
    id,
    ...CHROME[id],
    baseUrl: baseUrlOf(catalog),
    needsBaseUrl: id === 'custom',
    // Every model, so a stored pick still resolves; the panel reads `OFFERED_PROVIDERS`.
    models: Object.entries(catalog ?? {})
      .map(([modelId, entry]) => toModel(modelId, entry))
      .sort((a, b) => Number(b.strict) - Number(a.strict) || a.id.localeCompare(b.id)),
  };
});

/**
 * What the settings panel offers: constrained models only, and a vendor only if
 * it has one. Read from the catalog on every build, so a pi-ai upgrade that adds
 * strict support brings a vendor back with no change here.
 */
export const OFFERED_PROVIDERS: readonly Provider[] = PROVIDERS
  .map((provider) => ({ ...provider, models: provider.models.filter((m) => m.strict) }))
  .filter((provider) => provider.needsBaseUrl || provider.models.length > 0);

export function providerById(id: ProviderId): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

export function modelIn(id: ProviderId, modelId: string): ProviderModel | undefined {
  return providerById(id)?.models.find((m) => m.id === modelId);
}

/** The picked default, or — if a pi-ai upgrade retired it — the best still on offer. */
export function defaultModelOf(id: ProviderId): string {
  const provider = providerById(id);
  if (!provider) return '';
  const picked = CHROME[id].defaultModel;
  if (provider.models.some((m) => m.id === picked)) return picked;
  return provider.models.find((m) => m.strict)?.id ?? provider.models[0]?.id ?? '';
}

/** Whether a provider can hold any model to a schema at all. */
export function hasConstrainedModel(id: ProviderId): boolean {
  return providerById(id)?.models.some((m) => m.strict) ?? false;
}

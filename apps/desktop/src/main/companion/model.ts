import { createModels, createProvider, type Api, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAICodexResponsesApi } from '@earendil-works/pi-ai/api/openai-codex-responses.lazy';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import type { StreamFn } from '@earendil-works/pi-agent-core';
import { readCodexLogin, refreshCodexLogin, type CodexLogin } from '@cairn/core/runtime';
import {
  DEFAULT_OPENAI_BASE_URL, modelOf, type ProviderId, type ShellSettingsValues,
} from '../../shared/settings';
import { piRegistry } from '../pi-provider';

const DEFAULT_KEY_MODEL = 'gpt-4o-mini';
const COMPAT_PROVIDER = 'cairn-openai-compatible';

export class ChatModelError extends Error {
  constructor(readonly code: 'no_credential' | 'model_unavailable') {
    super(code);
    this.name = 'ChatModelError';
  }
}

export interface ChatModelResolution {
  readonly model: Model<Api>;
  readonly streamFn: StreamFn;
  readonly getApiKey: (provider: string) => Promise<string | undefined>;
}

interface ModelDependencies {
  readonly readLogin?: () => Promise<CodexLogin>;
  readonly refreshLogin?: () => Promise<string | undefined>;
  readonly now?: () => number;
}

function jwtExpiry(token: string): number | undefined {
  const payload = token.split('.')[1];
  if (!payload) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || !('exp' in parsed)) return undefined;
    const exp = parsed.exp;
    return typeof exp === 'number' && Number.isFinite(exp) ? exp * 1_000 : undefined;
  } catch {
    return undefined;
  }
}

/** One provider from the registry, with the reader's key for it. */
function onProvider(
  settings: ShellSettingsValues,
  id: ProviderId,
): ChatModelResolution {
  const profile = settings.providers[id];
  const key = profile?.apiKey.trim() ?? '';
  if (!key) throw new ChatModelError('no_credential');

  const built = piRegistry(id, modelOf(settings, id), profile?.baseUrl.trim() || undefined);
  if (!built) throw new ChatModelError('model_unavailable');

  return {
    model: built.model as Model<Api>,
    streamFn: built.models.streamSimple.bind(built.models),
    getApiKey: async (requested) => (requested === id ? key : undefined),
  };
}

export async function resolveChatModel(
  settings: ShellSettingsValues,
  dependencies: ModelDependencies = {},
): Promise<ChatModelResolution> {
  if (settings.chatProvider !== 'inherit') return onProvider(settings, settings.chatProvider);

  // `inherit` means whatever generation uses — and when that is configured, the
  // registry answers for both. Only an unconfigured app falls through to the
  // codex login below, which is what makes this work with no setup at all on the
  // machine it was developed on.
  const generation = settings.providers[settings.generationProvider];
  if (generation?.apiKey.trim()) return onProvider(settings, settings.generationProvider);

  const readLogin = dependencies.readLogin ?? readCodexLogin;
  const refreshLogin = dependencies.refreshLogin ?? refreshCodexLogin;
  const now = dependencies.now ?? Date.now;
  const login = await readLogin();

  if (login.kind === 'apiKey') {
    const key = login.apiKey.trim();
    if (!key) throw new ChatModelError('no_credential');
    const baseUrl = login.baseUrl || DEFAULT_OPENAI_BASE_URL;
    const id = login.model || DEFAULT_KEY_MODEL;
    const model: Model<'openai-completions'> = {
      id, name: id, api: 'openai-completions', provider: COMPAT_PROVIDER, baseUrl,
      reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 8192, maxTokens: 4096,
    };
    const models = createModels();
    models.setProvider(createProvider({
      id: COMPAT_PROVIDER, name: 'OpenAI-compatible', baseUrl,
      auth: { apiKey: { name: 'Configured API key', resolve: async ({ credential }) =>
        credential?.key ? { auth: { apiKey: credential.key } } : undefined } },
      models: [model], api: openAICompletionsApi(),
    }));
    return { model, streamFn: models.streamSimple.bind(models), getApiKey: async () => key };
  }

  if (login.kind !== 'oauth') throw new ChatModelError('no_credential');
  const models = createModels();
  const codex = openaiCodexProvider();
  models.setProvider(createProvider({
    id: codex.id, name: codex.name, baseUrl: codex.baseUrl,
    auth: { apiKey: { name: 'Codex CLI login', resolve: async ({ credential }) =>
      credential?.key ? { auth: { apiKey: credential.key } } : undefined } },
    models: codex.getModels(), api: openAICodexResponsesApi(),
  }));
  const model = models.getModel(codex.id, login.model);
  if (!model) throw new ChatModelError('model_unavailable');
  let renewed: string | undefined;
  let refreshing: Promise<string | undefined> | undefined;
  const initialExpiry = jwtExpiry(login.accessToken);
  if (initialExpiry !== undefined && initialExpiry <= now() + 60_000) {
    const refreshed = await refreshLogin().catch(() => undefined);
    if (!refreshed || (jwtExpiry(refreshed) ?? Number.POSITIVE_INFINITY) <= now() + 60_000) {
      throw new ChatModelError('no_credential');
    }
    renewed = refreshed;
  }
  return {
    model,
    streamFn: models.streamSimple.bind(models),
    getApiKey: async (provider) => {
      if (provider !== codex.id) return undefined;
      const current = await readLogin().catch(() => ({ kind: 'none' as const }));
      if (current.kind !== 'oauth') return renewed;
      const token = renewed ?? current.accessToken;
      const expiresAt = jwtExpiry(token);
      if (expiresAt === undefined || expiresAt > now() + 60_000) return token;
      refreshing ??= refreshLogin().catch(() => undefined).finally(() => { refreshing = undefined; });
      const refreshed = await refreshing;
      if (!refreshed || (jwtExpiry(refreshed) ?? Number.POSITIVE_INFINITY) <= now() + 60_000) {
        return undefined;
      }
      renewed = refreshed;
      return refreshed;
    },
  };
}

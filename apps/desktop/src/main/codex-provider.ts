/**
 * The `openai-codex` provider, built from the credentials `codex login` left on
 * disk — llm-space's `openaiCodexProvider`, so both apps treat one login the same.
 */
import { createModels, createProvider, type Model } from '@earendil-works/pi-ai';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';
import { openAICodexResponsesApi } from '@earendil-works/pi-ai/api/openai-codex-responses.lazy';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { openAIResponsesApi } from '@earendil-works/pi-ai/api/openai-responses.lazy';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import {
  type CodexCredentials, type CodexWireApi, readCodexCredentials, refreshCodexLogin,
} from '@cairn/core/runtime';

type Registry = ReturnType<typeof createModels>;

const WIRE_APIS: Readonly<Record<CodexWireApi, () => ReturnType<typeof openAIResponsesApi>>> = {
  'anthropic-messages': anthropicMessagesApi,
  'openai-completions': openAICompletionsApi,
  'openai-responses': openAIResponsesApi,
};

/** The key a call carries is the one it was given: the token or key read from `~/.codex`. */
const passThrough = {
  name: 'Codex CLI credentials',
  resolve: async ({ credential }: { credential?: { key?: string } }) =>
    (credential?.key ? { auth: { apiKey: credential.key } } : undefined),
};

export function codexRegistry(
  modelId: string,
  credentials: CodexCredentials,
): { models: Registry; model: Model<never> } | undefined {
  const codex = openaiCodexProvider();
  const catalog = codex.getModels();
  const provider = credentials.mode === 'apiKey'
    ? createProvider({
      id: codex.id, name: codex.name, baseUrl: credentials.baseUrl,
      auth: { apiKey: passThrough },
      models: catalog.map((model) => ({ ...model, api: credentials.api, baseUrl: credentials.baseUrl })),
      api: WIRE_APIS[credentials.api](),
    })
    : createProvider({
      id: codex.id, name: codex.name, baseUrl: codex.baseUrl,
      auth: { apiKey: passThrough },
      models: catalog,
      api: openAICodexResponsesApi(),
    });

  const models = createModels();
  models.setProvider(provider as Parameters<Registry['setProvider']>[0]);
  const model = models.getModel(codex.id, modelId);
  return model ? { models, model: model as Model<never> } : undefined;
}

/**
 * Read the login, renewing an expired ChatGPT token first. llm-space leaves that
 * to the next `codex` run; Cairn already refreshed, and dropping it would 401.
 */
export async function codexCredentials(
  read: () => Promise<CodexCredentials | undefined> = readCodexCredentials,
  refresh: () => Promise<string | undefined> = refreshCodexLogin,
  now: () => number = Date.now,
): Promise<CodexCredentials | undefined> {
  const credentials = await read();
  if (credentials?.mode !== 'oauth') return credentials;
  const expiresAt = jwtExpiry(credentials.apiKey);
  if (expiresAt === undefined || expiresAt > now() + 60_000) return credentials;
  const renewed = await refresh().catch(() => undefined);
  return renewed ? { mode: 'oauth', apiKey: renewed } : undefined;
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

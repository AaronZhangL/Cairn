import { describe, expect, test } from 'bun:test';
import {
  defaultModelOf, hasConstrainedModel, modelIn, OFFERED_PROVIDERS, PROVIDER_IDS, PROVIDERS, providerById,
  type ProviderId,
} from '../../src/shared/providers';

describe('provider registry', () => {
  test('every vendor but `custom` and Codex names the environment variable its key field starts out reading', () => {
    for (const id of PROVIDER_IDS) {
      expect(providerById(id)?.envKey === undefined).toBe(id === 'custom' || id === 'openai-codex');
    }
  });

  test('Codex signs in with the codex login instead of a key, and is offered like llm-space offers it', () => {
    expect(providerById('openai-codex')?.signIn).toBe(true);
    expect(PROVIDERS.filter((p) => p.signIn).map((p) => p.id)).toEqual(['openai-codex']);
    expect(OFFERED_PROVIDERS.find((p) => p.id === 'openai-codex')?.models.length).toBeGreaterThan(0);
  });

  test('every id resolves, and only `custom` ships without models', () => {
    for (const id of PROVIDER_IDS) {
      const provider = providerById(id);
      expect(provider).toBeDefined();
      if (id !== 'custom') expect(provider!.models.length).toBeGreaterThan(0);
    }
  });

  // A pi-ai upgrade is the one thing that can retire a model id under us, and a
  // stale default would surface as a 404 from the provider on the first call.
  test('every picked default still exists in the catalog', () => {
    for (const id of PROVIDER_IDS) {
      if (id === 'custom') continue;
      const picked = defaultModelOf(id);
      expect(modelIn(id, picked), `${id} default ${picked}`).toBeDefined();
    }
  });

  test('a default is constrained whenever the provider has any constrained model', () => {
    for (const id of PROVIDER_IDS) {
      if (!hasConstrainedModel(id)) continue;
      expect(modelIn(id, defaultModelOf(id))!.strict, id).toBe(true);
    }
  });

  // Anthropic spells the flag `supportsStrictTools`; reading only the OpenAI
  // spelling marked all fifteen Claude models as unconstrained.
  test('Anthropic reads as constrained', () => {
    expect(hasConstrainedModel('anthropic')).toBe(true);
  });

  test('a provider with no constrained model says so rather than pretending', () => {
    // Measured against pi-ai 0.87.1. If an upgrade adds strict support here, this
    // failing is the notification — update it, do not delete it.
    expect(hasConstrainedModel('moonshotai')).toBe(false);
    expect(hasConstrainedModel('minimax')).toBe(false);
  });

  test('constrained models sort ahead of unconstrained ones', () => {
    for (const provider of PROVIDERS) {
      const flags = provider.models.map((m) => m.strict);
      expect(flags.indexOf(false) === -1 || flags.lastIndexOf(true) < flags.indexOf(false), provider.id).toBe(true);
    }
  });

  // The catalog is alphabetical, which buried GPT-6 between gpt-4 and o1.
  test('newer models sort ahead of older ones, with vendor-prefixed ids grouped by vendor', () => {
    const ids = (id: ProviderId) => providerById(id)!.models.map((m) => m.id);
    expect(ids('openai').slice(0, 3)).toEqual(['gpt-6-astra', 'gpt-6-luna', 'gpt-6-sol']);
    expect(ids('openai').indexOf('gpt-5.6-sol')).toBeLessThan(ids('openai').indexOf('gpt-5.4-mini'));
    expect(ids('google')[0]).toBe('gemini-3.8-flash');
    const groq = ids('groq');
    expect(groq.indexOf('openai/gpt-oss-120b')).toBeLessThan(groq.indexOf('qwen/qwen3.8-27b'));
    expect(groq.indexOf('qwen/qwen3.8-27b')).toBeLessThan(groq.indexOf('qwen/qwen3.6-27b'));
  });

  // Gemini carries no catalog flag; pi-ai goes by major version. Reading the flag
  // alone marked all of Google unconstrained, which would now hide it.
  test('Gemini 3 and later read as constrained, Gemini 2 does not', () => {
    expect(modelIn('google', 'gemini-3.5-flash')?.strict).toBe(true);
    expect(modelIn('google', 'gemini-2.5-flash')?.strict).toBe(false);
  });

  test('the panel is offered constrained models only, except where the account decides', () => {
    for (const provider of OFFERED_PROVIDERS.filter((p) => !p.signIn)) {
      expect(provider.models.every((m) => m.strict), provider.id).toBe(true);
    }
  });

  // Derived from the flag, not listed: a pi-ai upgrade that adds strict support
  // to one of these makes it appear with no code change.
  test('a vendor with no constrained model is not offered, custom always is', () => {
    const offered = OFFERED_PROVIDERS.map((p) => p.id);
    for (const id of PROVIDER_IDS) {
      expect(offered.includes(id), id).toBe(id === 'custom' || id === 'openai-codex' || hasConstrainedModel(id));
    }
    expect(offered).not.toContain('xai');
  });

  test('stored picks outside the offer still resolve in the full registry', () => {
    expect(modelIn('xai', defaultModelOf('xai'))).toBeDefined();
  });
});


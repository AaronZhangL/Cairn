import { describe, expect, test } from 'bun:test';
import {
  defaultModelOf, hasConstrainedModel, modelIn, OFFERED_PROVIDERS, PROVIDER_IDS, PROVIDERS, providerById,
} from '../../src/shared/providers';

describe('provider registry', () => {
  test('every vendor but `custom` names the environment variable its key field starts out reading', () => {
    for (const id of PROVIDER_IDS) {
      expect(providerById(id)?.envKey === undefined).toBe(id === 'custom');
    }
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

  // Gemini carries no catalog flag; pi-ai goes by major version. Reading the flag
  // alone marked all of Google unconstrained, which would now hide it.
  test('Gemini 3 and later read as constrained, Gemini 2 does not', () => {
    expect(modelIn('google', 'gemini-3.5-flash')?.strict).toBe(true);
    expect(modelIn('google', 'gemini-2.5-flash')?.strict).toBe(false);
  });

  test('the panel is offered constrained models only', () => {
    for (const provider of OFFERED_PROVIDERS) {
      expect(provider.models.every((m) => m.strict), provider.id).toBe(true);
    }
  });

  // Derived from the flag, not listed: a pi-ai upgrade that adds strict support
  // to one of these makes it appear with no code change.
  test('a vendor with no constrained model is not offered, custom always is', () => {
    const offered = OFFERED_PROVIDERS.map((p) => p.id);
    for (const id of PROVIDER_IDS) {
      expect(offered.includes(id), id).toBe(id === 'custom' || hasConstrainedModel(id));
    }
    expect(offered).not.toContain('xai');
  });

  test('stored picks outside the offer still resolve in the full registry', () => {
    expect(modelIn('xai', defaultModelOf('xai'))).toBeDefined();
  });
});


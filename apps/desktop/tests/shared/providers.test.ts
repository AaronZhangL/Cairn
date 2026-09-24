import { describe, expect, test } from 'bun:test';
import {
  defaultModelOf, hasConstrainedModel, modelIn, PROVIDER_IDS, PROVIDERS, providerById,
} from '../../src/shared/providers';

describe('provider registry', () => {
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
});

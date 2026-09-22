import { describe, expect, test } from 'bun:test';
import { candidateDirs, findEdgeTts } from '../../src/runtime/edge-tts';

describe('edge-tts discovery', () => {
  test('looks beyond PATH, where a pip-installed tool actually lands', () => {
    const dirs = candidateDirs('/Users/x');
    expect(dirs).toContain('/Users/x/.local/bin');
    expect(dirs).toContain('/opt/homebrew/bin');
    expect(dirs).toContain('/Users/x/.pyenv/shims');
  });

  test('an explicit override wins over discovery', async () => {
    const before = process.env.CAIRN_EDGE_TTS;
    process.env.CAIRN_EDGE_TTS = '/custom/edge-tts';
    try {
      expect(await findEdgeTts()).toBe('/custom/edge-tts');
    } finally {
      if (before === undefined) delete process.env.CAIRN_EDGE_TTS;
      else process.env.CAIRN_EDGE_TTS = before;
    }
  });
});

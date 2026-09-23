import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWorking, saveWorking } from '../../../src/main/companion/working';

test('compaction state persists by path generation without replacing old summaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cairn-working-'));
  try {
    await mkdir(join(root, 'books', 'a'), { recursive: true });
    expect(await loadWorking(root, 'a', 'generation-1')).toEqual({ summary: '', retainedFrom: 0 });
    await saveWorking(root, 'a', 'generation-1', { summary: 'old', retainedFrom: 6 });
    expect(await loadWorking(root, 'a', 'generation-2')).toEqual({ summary: '', retainedFrom: 0 });
    await saveWorking(root, 'a', 'generation-2', { summary: 'new', retainedFrom: 3 });
    expect(await loadWorking(root, 'a', 'generation-1')).toEqual({ summary: 'old', retainedFrom: 6 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

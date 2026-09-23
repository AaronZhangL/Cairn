import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSession, saveSession, SessionError } from '../../../src/main/companion/session';

const dir = await mkdtemp(join(tmpdir(), 'cairn-chat-'));
beforeEach(async () => {
  await mkdir(join(dir, 'books/book-one'), { recursive: true });
  await rm(join(dir, 'books/book-one/chat.json'), { force: true });
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('chat session storage', () => {
  test('returns an empty conversation for a new path', async () => {
    expect(await loadSession(dir, 'book-one', 'generation-a')).toEqual({
      pathGeneratedAt: 'generation-a', messages: [], evidence: [],
    });
  });

  test('persists complete messages and evidence', async () => {
    const session = {
      pathGeneratedAt: 'generation-a',
      messages: [{ id: 'm1', role: 'user' as const, text: 'Why?', at: '2026-01-01T00:00:00Z' }],
      evidence: [{ resultId: 'r1', source: 'book' as const, refs: [{ chapter: 1, title: 'One' }] }],
    };
    await saveSession(dir, 'book-one', session);
    expect(await loadSession(dir, 'book-one', 'generation-a')).toEqual(session);
  });

  test('a regenerated path starts clean without deleting the earlier archive', async () => {
    await saveSession(dir, 'book-one', {
      pathGeneratedAt: 'generation-a',
      messages: [{ id: 'm1', role: 'user', text: 'Old?', at: '2026-01-01T00:00:00Z' }], evidence: [],
    });
    expect((await loadSession(dir, 'book-one', 'generation-b')).messages).toEqual([]);
    await saveSession(dir, 'book-one', { pathGeneratedAt: 'generation-b', messages: [], evidence: [] });
    const archive = JSON.parse(await readFile(join(dir, 'books/book-one/chat.json'), 'utf8')) as {
      sessions: { pathGeneratedAt: string }[];
    };
    expect(archive.sessions.map((item) => item.pathGeneratedAt)).toEqual(['generation-a', 'generation-b']);
  });

  test('malformed stored JSON fails explicitly', async () => {
    await writeFile(join(dir, 'books/book-one/chat.json'), '{bad');
    await expect(loadSession(dir, 'book-one', 'generation-a')).rejects.toBeInstanceOf(SessionError);
  });

  test('rejects a book id that could escape the library', async () => {
    await expect(loadSession(dir, '../outside', 'generation-a')).rejects.toBeInstanceOf(SessionError);
  });
});

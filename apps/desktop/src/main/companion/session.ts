import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bookFile, isBookId } from '@cairn/core/store/library';
import type { ChatSession } from '@cairn/core/companion/types';

interface ChatArchive {
  readonly version: 1;
  readonly sessions: readonly ChatSession[];
}

export class SessionError extends Error {
  constructor(readonly code: 'invalid_book_id' | 'corrupt_archive') {
    super(code);
    this.name = 'SessionError';
  }
}

const chatPath = (root: string, bookId: string): string => join(root, bookFile(bookId, 'chat.json'));
const empty = (pathGeneratedAt: string): ChatSession => ({ pathGeneratedAt, messages: [], evidence: [] });

function validSession(value: unknown): value is ChatSession {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ChatSession>;
  return typeof candidate.pathGeneratedAt === 'string'
    && Array.isArray(candidate.messages)
    && candidate.messages.every((message: unknown) => {
      if (typeof message !== 'object' || message === null) return false;
      const item = message as Record<string, unknown>;
      return typeof item.id === 'string' && typeof item.text === 'string'
        && typeof item.at === 'string' && (item.role === 'user' || item.role === 'assistant' || item.role === 'tool')
        && (item.role !== 'assistant' || (Array.isArray(item.citations)
          && (item.options === undefined || (Array.isArray(item.options) && item.options.every((option: unknown) => typeof option === 'string')))))
        && (item.role !== 'tool' || (typeof item.name === 'string' && typeof item.resultId === 'string'));
    })
    && Array.isArray(candidate.evidence)
    && candidate.evidence.every((record: unknown) => {
      if (typeof record !== 'object' || record === null) return false;
      const item = record as Record<string, unknown>;
      return typeof item.resultId === 'string' && Array.isArray(item.refs)
        && (item.source === 'book' || item.source === 'web' || item.source === 'shelf');
    });
}

async function readArchive(root: string, bookId: string): Promise<ChatArchive> {
  let raw: string;
  try {
    raw = await readFile(chatPath(root, bookId), 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return { version: 1, sessions: [] };
    throw cause;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new SessionError('corrupt_archive');
  }
  if (typeof value !== 'object' || value === null) throw new SessionError('corrupt_archive');
  const archive = value as Partial<ChatArchive>;
  if (archive.version !== 1 || !Array.isArray(archive.sessions) || !archive.sessions.every(validSession)) {
    throw new SessionError('corrupt_archive');
  }
  return { version: 1, sessions: archive.sessions };
}

export async function loadSession(root: string, bookId: string, pathGeneratedAt: string): Promise<ChatSession> {
  if (!isBookId(bookId)) throw new SessionError('invalid_book_id');
  const archive = await readArchive(root, bookId);
  return archive.sessions.find((session) => session.pathGeneratedAt === pathGeneratedAt)
    ?? empty(pathGeneratedAt);
}

export async function saveSession(root: string, bookId: string, session: ChatSession): Promise<void> {
  if (!isBookId(bookId)) throw new SessionError('invalid_book_id');
  if (!validSession(session)) throw new SessionError('corrupt_archive');
  const archive = await readArchive(root, bookId);
  const sessions = [...archive.sessions.filter((item) => item.pathGeneratedAt !== session.pathGeneratedAt), session];
  const target = chatPath(root, bookId);
  const pending = `${target}.${randomUUID()}.tmp`;
  await writeFile(pending, JSON.stringify({ version: 1, sessions }));
  await rename(pending, target);
}

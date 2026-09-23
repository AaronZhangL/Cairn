import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CompactionState } from '@cairn/core/companion/compact';
import { bookFile, isBookId } from '@cairn/core/store/library';

interface WorkingRecord extends CompactionState {
  readonly pathGeneratedAt: string;
}

const file = (root: string, bookId: string): string => join(root, bookFile(bookId, 'working.json'));
const empty = (): CompactionState => ({ summary: '', retainedFrom: 0 });

function valid(value: unknown): value is WorkingRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Partial<WorkingRecord>;
  return typeof record.pathGeneratedAt === 'string' && typeof record.summary === 'string'
    && Number.isSafeInteger(record.retainedFrom) && (record.retainedFrom ?? -1) >= 0;
}

async function records(root: string, bookId: string): Promise<readonly WorkingRecord[]> {
  let raw: string;
  try {
    raw = await readFile(file(root, bookId), 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw cause;
  }
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || !value.every(valid)) throw new Error('corrupt_working_context');
  return value;
}

export async function loadWorking(root: string, bookId: string, pathGeneratedAt: string): Promise<CompactionState> {
  if (!isBookId(bookId)) throw new Error('invalid_book_id');
  const record = (await records(root, bookId)).find((item) => item.pathGeneratedAt === pathGeneratedAt);
  return record ? { summary: record.summary, retainedFrom: record.retainedFrom } : empty();
}

export async function saveWorking(root: string, bookId: string, pathGeneratedAt: string, state: CompactionState): Promise<void> {
  if (!isBookId(bookId) || !Number.isSafeInteger(state.retainedFrom) || state.retainedFrom < 0) {
    throw new Error('invalid_working_context');
  }
  const prior = await records(root, bookId);
  const next = [...prior.filter((item) => item.pathGeneratedAt !== pathGeneratedAt), { ...state, pathGeneratedAt }];
  const target = file(root, bookId);
  const pending = `${target}.${randomUUID()}.tmp`;
  await writeFile(pending, JSON.stringify(next));
  await rename(pending, target);
}

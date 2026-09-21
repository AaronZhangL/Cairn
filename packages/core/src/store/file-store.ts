/**
 * A JobStore backed by a JSON file, used by the main process and local scripts.
 * runJob does not care what is underneath, only that get/put persist.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { JobStore } from '../pipeline/job';

export async function fileStore<R>(path: string): Promise<JobStore<R> & { size: number }> {
  const data = new Map<string, R>(
    Object.entries(
      JSON.parse(await readFile(path, 'utf8').catch(() => '{}')) as Record<string, R>,
    ),
  );

  const flush = async (): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(Object.fromEntries(data), null, 2), 'utf8');
  };

  return {
    get size() { return data.size; },
    async get(id) { return data.get(id); },
    async put(id, result) {
      data.set(id, result);
      // Flush on every write: ten minutes of results must not die with one crash
      await flush();
    },
  };
}

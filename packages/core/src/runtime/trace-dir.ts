/**
 * A TraceSink backed by a directory, one JSON file per call.
 *
 * One file per call rather than one appended log: the point is to pull a single
 * call back out and replay it, and grepping a 90-entry JSONL for the right
 * `reduce` line is worse than opening `reduce.json`. Repeated labels get a
 * numeric suffix so a retried call does not silently overwrite the attempt that
 * explains the failure.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TraceEntry, TraceSink } from '../llm/trace';

/** Anything that cannot be a filename becomes `-`, so labels can stay readable. */
export function traceFileName(label: string, seq: number): string {
  const safe = label.replace(/[^A-Za-z0-9._:-]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  const stem = safe.length > 0 ? safe : 'call';
  return seq === 0 ? `${stem}.json` : `${stem}.${seq}.json`;
}

export function traceDirSink(dir: string): TraceSink {
  const seen = new Map<string, number>();

  return {
    async write(entry: TraceEntry) {
      const seq = seen.get(entry.label) ?? 0;
      seen.set(entry.label, seq + 1);

      await mkdir(dir, { recursive: true });
      await writeFile(
        join(dir, traceFileName(entry.label, seq)),
        JSON.stringify(entry, null, 2),
        'utf8',
      );
    },
  };
}

/** Read one recorded call back, by the file name the sink gave it. */
export async function readTrace(dir: string, file: string): Promise<TraceEntry> {
  return JSON.parse(await readFile(join(dir, file), 'utf8')) as TraceEntry;
}

/** What was recorded, newest label first is not meaningful — so: sorted by name. */
export async function listTraces(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  return entries.filter((f) => f.endsWith('.json')).sort();
}

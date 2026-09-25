#!/usr/bin/env bun
/**
 * Replay one recorded model call.
 *
 *   bun run replay <bookId>                 list what was recorded
 *   bun run replay <bookId> reduce.json     send that exact prompt again
 *   bun run replay <bookId> reduce.json --diff   and show it against the old reply
 *
 * The point is the loop this closes. Changing a line in the reduce prompt used
 * to cost a whole run to evaluate, because the only way to reach reduce was to
 * go through map first. A recorded call carries its own prompt, so it can be
 * sent on its own in a few seconds.
 *
 * Needs `CAIRN_TRACE=1` on the run that produced the book; without it nothing
 * is recorded, which is the right default — a trace holds the prompts, and for
 * the map stage that is the book's text a second time.
 */
import { join } from 'node:path';
import { codexCliProvider } from '../packages/core/src/runtime/codex-cli';
import { listTraces, readTrace } from '../packages/core/src/runtime/trace-dir';
import { defaultLibraryDir } from '../packages/core/src/store/library-disk';

const traceDir = (bookId: string): string =>
  join(defaultLibraryDir(), '.cache', bookId, 'trace');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const [bookId, file] = args.filter((a) => !a.startsWith('--'));
  if (!bookId) return usage();

  const dir = traceDir(bookId);
  const files = await listTraces(dir);

  if (files.length === 0) {
    console.error(`${dir} 里没有记录。生成时加 CAIRN_TRACE=1 才会记录。`);
    process.exit(1);
  }

  if (!file) {
    console.log(`${dir}\n`);
    for (const name of files) {
      const entry = await readTrace(dir, name);
      const outcome = entry.error ? `✗ ${entry.error.slice(0, 60)}` : `${entry.raw?.length ?? 0} 字`;
      console.log(`  ${name.padEnd(28)} ${String(entry.ms).padStart(7)}ms  ${outcome}`);
    }
    return;
  }

  if (!files.includes(file)) {
    console.error(`没有 ${file}。可选：\n${files.map((f) => `  ${f}`).join('\n')}`);
    process.exit(1);
  }

  const entry = await readTrace(dir, file);
  console.log(`重放 ${file} · ${entry.label} · 原本耗时 ${entry.ms}ms\n`);

  const started = Date.now();
  const raw = await codexCliProvider().complete({
    prompt: entry.prompt,
    ...(entry.system ? { system: entry.system } : {}),
    ...(entry.schema ? { schema: entry.schema } : {}),
    label: `replay:${entry.label}`,
  });

  console.log(`${Date.now() - started}ms\n`);
  console.log(raw);

  if (args.includes('--diff') && entry.raw) {
    console.log(`\n--- 原始回复 ---\n`);
    console.log(entry.raw);
  }
}

function usage(): void {
  console.log(`用法：bun run replay <bookId> [记录文件] [--diff]

不给文件名时列出这本书记录了哪些调用。
生成时需要 CAIRN_TRACE=1，否则没有记录可重放。`);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(`\n失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

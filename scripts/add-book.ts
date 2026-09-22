#!/usr/bin/env bun
/**
 * Turn a book into a walkable path and install it as the app's current bundle.
 *
 *   bun run add-book <file> [--budget quick|brief|solid|full]
 *
 * Every expensive stage is cached under .cache/<bookId>/, so a re-run after an
 * interruption picks up where it stopped instead of paying for it twice.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { parseBook } from '../packages/core/src/parse/index';
import { mapChapters } from '../packages/core/src/pipeline/map';
import { classifyBook } from '../packages/core/src/pipeline/classify';
import { reduceToPath } from '../packages/core/src/pipeline/reduce';
import { buildDecks, withRealDuration } from '../packages/core/src/pipeline/build';
import { edgeTtsNarrator } from '../packages/core/src/runtime/edge-tts';
import { BUDGETS, suggestBudgets, type BudgetId } from '../packages/core/src/pipeline/budget';
import { fileStore } from '../packages/core/src/store/file-store';
import { codexCliProvider } from '../packages/core/src/runtime/codex-cli';
import {
  bookSlug, LIBRARY_INDEX, type LibraryEntry, type PathQuality,
} from '../packages/core/src/store/library';
import { libraryDir } from '../apps/desktop/src/main/library';
import type { ChapterNote, NodeDeck, Path } from '../packages/core/src/types';

const ROOT = resolve(import.meta.dirname, '..');
/** The same library the app reads, so a book added here shows up there. */
const LIBRARY = libraryDir();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) return usage();

  const wanted = flag(args, '--budget') as BudgetId | undefined;
  if (wanted && !(wanted in BUDGETS)) return usage(`未知预算：${wanted}`);

  const bytes = new Uint8Array(await Bun.file(file).arrayBuffer());
  const book = await parseBook(bytes, basename(file));
  const bookId = bookSlug(book.title, (s) => Bun.hash(s).toString(16), resolve(file));
  const cache = join(ROOT, '.cache', bookId);

  console.log(`《${book.title}》${book.author ? ` · ${book.author}` : ''}`);
  console.log(`${book.chapters.length} 章 · ${book.totalWords.toLocaleString()} 字\n`);

  const { choices, recommended } = suggestBudgets(book.totalWords);
  const budget = BUDGETS[wanted ?? recommended];
  console.log('可选预算：');
  for (const c of choices) {
    const mark = c.budget.id === budget.id ? '▸' : ' ';
    console.log(`  ${mark} ${c.honest ? '  ' : '⚠ '}${c.budget.label}${c.note ? `\n        ${c.note}` : ''}`);
  }
  console.log(`\n使用：${budget.label}\n`);

  // Fail before spending anything if the narration cannot be synthesized
  const narrator = edgeTtsNarrator();
  await narrator.ensureReady();

  const provider = codexCliProvider();

  // --- map: the only stage that reads the book, and the expensive one ---
  const mapStore = await fileStore<readonly ChapterNote[]>(join(cache, 'map.json'));
  if (mapStore.size > 0) console.log(`map 缓存命中 ${mapStore.size} 批`);
  const { notes, job } = await mapChapters(book.chapters, provider, mapStore, {
    onProgress: (p) => bar('map   ', p.done + p.failed, p.total, p.running, p.failed),
  });
  console.log();
  for (const f of job.failures) console.log(`  ✗ ${f.taskId}: ${f.error.message.slice(0, 120)}`);
  if (notes.length === 0) throw new Error('map 没有产出任何摘要');

  // --- classify + reduce: cheap, always fresh so a budget change takes effect ---
  process.stdout.write('classify… ');
  const cls = await classifyBook(book.title, notes, provider);
  console.log(cls.type);

  process.stdout.write('reduce…   ');
  const path = await reduceToPath(notes, cls.type, book.totalWords, provider, { budget });
  console.log(`${path.nodes.length} 站 / ${path.stages.length} 阶段 / 预估 ${path.totalMinutes} 分钟`);

  const full: Path = {
    bookId, title: book.title, type: cls.type,
    nodes: path.nodes, stages: path.stages,
    totalMinutes: path.totalMinutes, generatedAt: new Date().toISOString(),
  };

  // --- slides + tts per station ---
  const audioDir = join(cache, 'audio');
  const deckStore = await fileStore<NodeDeck>(join(cache, `decks-${budget.id}.json`));
  const built = await buildDecks(full, notes, audioDir, provider, narrator, deckStore, {
    onProgress: (p) => bar('decks ', p.done + p.failed, p.total, p.running, p.failed),
  });
  console.log();
  for (const f of built.job.failures) console.log(`  ✗ ${f.taskId}: ${f.error.message.slice(0, 120)}`);

  const quality: PathQuality = {
    dropped: path.dropped,
    retries: path.retries,
    failed: built.job.failures.length,
    unsourcedQuotes: built.unsourcedQuotes,
    estMinutes: path.totalMinutes,
    budgetMaxMinutes: budget.maxMinutes,
  };

  await install(
    withRealDuration(full, built.totalMinutes), built.decks, notes, book.chapters, audioDir,
    budget.id, quality, book.author,
  );

  // The two numbers worth watching after a prompt change; both should be 0
  console.log(`\n虚构章号被丢弃 ${quality.dropped} 站 · 引文对不上原文 ${quality.unsourcedQuotes} 张`);

  console.log(`\n真实总时长 ${built.totalMinutes} 分钟（预估 ${path.totalMinutes}）`);
  console.log(`已装载到 ${LIBRARY}。运行 \`cd apps/desktop && bun run start\` 查看。`);
}

/** One directory per book, plus an index the app reads at startup. */
async function install(
  path: Path,
  decks: readonly NodeDeck[],
  notes: readonly ChapterNote[],
  chapters: readonly unknown[],
  audioDir: string,
  budgetId: string,
  quality: PathQuality,
  author?: string,
): Promise<void> {
  const dir = join(LIBRARY, 'books', path.bookId);
  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, 'audio'), { recursive: true });

  await writeFile(join(dir, 'path.json'), JSON.stringify(path));
  await writeFile(join(dir, 'notes.json'), JSON.stringify(notes));

  // One file per station, same layout the app builds into, so a book made here
  // and a book made there are indistinguishable to the player.
  await mkdir(join(dir, 'decks'), { recursive: true });
  for (const deck of decks) {
    await writeFile(join(dir, 'decks', `${deck.nodeId}.json`), JSON.stringify(deck));
  }
  await writeFile(join(dir, 'decks', 'index.json'), JSON.stringify({
    total: path.nodes.length,
    ready: decks.map((d) => d.nodeId),
    failed: path.nodes.filter((n) => !decks.some((d) => d.nodeId === n.id)).map((n) => n.id),
    complete: true,
  }));
  // Anchored questions read the original text; without this the feature is mute
  await writeFile(join(dir, 'chapters.json'), JSON.stringify(chapters));

  for (const deck of decks) {
    // Source name is content-keyed (see `deckKey`), destination is the station id
    // the player builds its URL from. Reconstructing the source from the id is
    // what shipped one budget's audio with another budget's subtitles.
    await Bun.write(
      join(dir, 'audio', `${deck.nodeId}.mp3`),
      Bun.file(join(audioDir, basename(deck.audioPath))),
    );
  }

  const entry: LibraryEntry = {
    id: path.bookId, title: path.title, ...(author ? { author } : {}),
    stations: path.nodes.length, minutes: path.totalMinutes,
    budgetId, generatedAt: path.generatedAt,
    complete: true, built: decks.length, quality,
  };
  const indexPath = join(LIBRARY, LIBRARY_INDEX);
  const existing = await Bun.file(indexPath).json().catch(() => []) as LibraryEntry[];
  await writeFile(indexPath, JSON.stringify([entry, ...existing.filter((b) => b.id !== entry.id)]));
}

function bar(label: string, done: number, total: number, running: number, failed: number): void {
  const width = 24;
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  const suffix = failed > 0 ? ` 失败 ${failed}` : '';
  process.stdout.write(
    `\r${label} [${'█'.repeat(filled)}${'·'.repeat(width - filled)}] ${done}/${total} 跑 ${running}${suffix}   `,
  );
}

const flag = (args: string[], name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

function usage(message?: string): void {
  if (message) console.error(`${message}\n`);
  console.log(`用法：bun run add-book <书文件> [--budget quick|brief|solid|full]

支持 .epub / .txt / .md
预算档位：
${Object.values(BUDGETS).map((b) => `  ${b.id.padEnd(6)} ${b.label}`).join('\n')}

不指定预算时按书的体量推荐。书不会离开这台机器。`);
  process.exit(message ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(`\n失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

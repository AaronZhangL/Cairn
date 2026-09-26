#!/usr/bin/env bun
/**
 * Judge whether a pipeline change made paths better or worse.
 *
 *   bun run eval [bookId … | --all] [--runs 3] [--against <runId>]
 *
 * With no book named it runs the fixed set in eval-set.json, so two runs weeks
 * apart judge the same books. Re-runs classify + reduce on the library's frozen chapter notes and sets the
 * new paths against the shelf's (or an earlier eval run's). Method: docs/EVAL.md.
 */
import { join } from 'node:path';
import type { EvalBook, Scored, Typed, BookEval } from '../packages/core/src/eval/run';
import { evaluateBook, isFailed } from '../packages/core/src/eval/run';
import { COHERENCE_MODES } from '../packages/core/src/eval/judge';
import { MIN_PATHS, type SideSummary, summarize } from '../packages/core/src/eval/summary';
import { localeFromText } from '../packages/core/src/parse/language';
import { budgetsFor, type BudgetId } from '../packages/core/src/pipeline/budget';
import { isRecap } from '../packages/core/src/pipeline/recap';
import { bookFile, type LibraryEntry } from '../packages/core/src/store/library';
import { fileStore } from '../packages/core/src/store/file-store';
import type { Chapter, Path } from '../packages/core/src/types';
import { providerFor } from '../apps/desktop/src/main/provider';
import EVAL_SET from './eval-set.json';
import { library } from '../apps/desktop/src/main/store';

const EVAL_DIR = join(library.root, '.eval');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) return usage();
  const runs = Number(flag(args, '--runs') ?? 3);
  if (!Number.isInteger(runs) || runs < 1) return usage('--runs 需要正整数');
  const against = flag(args, '--against');
  const wanted = args.filter((a, i) => !a.startsWith('--') && !['--runs', '--against'].includes(args[i - 1] ?? ''));

  const all = args.includes('--all');
  const ids = wanted.length > 0 ? wanted : EVAL_SET.map((b) => b.id);
  const shelf = await library.list();
  const entries = shelf.filter((e) => all || ids.includes(e.id));
  const absent = all ? [] : ids.filter((id) => !shelf.some((e) => e.id === id));
  for (const id of absent) {
    const title = EVAL_SET.find((b) => b.id === id)?.title;
    console.log(`○ ${title ?? id} —— 不在库里${title ? '，先用 bun run add-book 加进来' : ''}`);
  }
  if (entries.length === 0) return usage('没有可评测的书');
  const earlier = against ? await readRun(against) : undefined;

  const runId = new Date().toISOString().replace(/[:.]/g, '-');
  const ideasStore = await fileStore<readonly string[]>(join(EVAL_DIR, 'ideas.json'));
  const results: BookEval[] = [];
  console.log(`评测 ${entries.length} 本书，每本 ${runs} 次，基线：${against ? `评测 ${against}` : '书架上的 path'}\n`);

  for (const entry of entries) {
    const book = await loadBook(entry, earlier);
    if (!book) {
      console.log(`○ ${entry.title} —— 跳过：${earlier ? '那次评测里没有这本书' : '没有章节笔记或 path'}`);
      continue;
    }
    process.stdout.write(`● ${book.title}（${book.budget.id}）`);
    const result = await evaluateBook(book, await providerFor(book.id), {
      runs, ideasStore, onStep: (s) => process.stdout.write(` · ${s}`),
    });
    results.push(result);
    // Written after every book, so a run cut short still leaves what it judged
    await Bun.write(join(EVAL_DIR, runId, 'report.json'), JSON.stringify(results, null, 2));
    console.log();
    printBook(result);
  }

  if (results.length === 0) return;
  printSummary(results);
  console.log(`\n详细结果：${join(EVAL_DIR, runId, 'report.json')}`);
  console.log(`下次对比这次：bun run eval --against ${runId}`);
}

async function loadBook(entry: LibraryEntry, earlier: readonly BookEval[] | undefined): Promise<EvalBook | undefined> {
  const [notes, path, chapters] = await Promise.all([
    library.loadNotes(entry.id).catch(() => undefined),
    library.loadPath(entry.id).catch(() => undefined),
    Bun.file(join(library.root, bookFile(entry.id, 'chapters.json'))).json().catch(() => undefined) as
      Promise<Chapter[] | undefined>,
  ]);
  if (!notes || notes.length === 0 || !path || !chapters) return undefined;

  const baselines = earlier
    ? earlier.find((b) => b.bookId === entry.id)?.candidates.filter((c): c is Scored => !isFailed(c))
    : [shelfPath(path)];
  if (!baselines || baselines.length === 0) return undefined;

  const shape = { totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0), chapterCount: chapters.length };
  return {
    id: entry.id,
    title: entry.title,
    // Books added before languages were recorded: count the notes, as parse would have counted the text
    language: entry.language ?? localeFromText(notes.map((n) => n.gist).join('\n')),
    kind: entry.kind ?? 'book',
    budget: budgetsFor(shape)[entry.budgetId as BudgetId],
    totalWords: shape.totalWords,
    notes,
    baselines,
  };
}

/** Recap is appended after reduce and is not reduce's work, so it is left out of both sides. */
function shelfPath(path: Path): Typed {
  const nodes = path.nodes.filter((n) => !isRecap(n));
  const kept = new Set(nodes.map((n) => n.id));
  const stages = path.stages
    .map((s) => ({ ...s, nodeIds: s.nodeIds.filter((id) => kept.has(id)) }))
    .filter((s) => s.nodeIds.length > 0);
  return { type: path.type, nodes, stages };
}

async function readRun(runId: string): Promise<readonly BookEval[]> {
  const file = Bun.file(join(EVAL_DIR, runId, 'report.json'));
  if (!(await file.exists())) throw new Error(`找不到评测 ${runId}（${EVAL_DIR}）`);
  return (await file.json()) as BookEval[];
}

function printBook(result: BookEval): void {
  const failed = result.candidates.filter(isFailed);
  for (const f of failed) console.log(`    ✗ 生成失败：${f.error}`);
  const outcomes = result.comparisons.map((c) => ({ candidate: '赢', baseline: '输', tie: '平' })[c.outcome]);
  console.log(`    对比基线：${outcomes.join(' ') || '无'}`);
  // The summary averages across books; a collapse confined to one book only shows here
  const { baseline, candidate } = summarize([result]);
  if (candidate.paths === 0) return;
  console.log(`    覆盖率 ${baseline.coverage.toFixed(2)} → ${candidate.coverage.toFixed(2)}`
    + ` · 位置偏移 ${baseline.positionSkew.toFixed(2)} → ${candidate.positionSkew.toFixed(2)}`);
}

function printSummary(results: readonly BookEval[]): void {
  const s = summarize(results);
  const row = (label: string, pick: (x: SideSummary) => number, digits = 2): string =>
    `  ${label.padEnd(14)} ${pick(s.baseline).toFixed(digits).padStart(6)} → ${pick(s.candidate).toFixed(digits)}`;

  console.log('\n—— 汇总（基线 → 本次）——');
  console.log(row('覆盖率', (x) => x.coverage));
  console.log(row('忠实站点占比', (x) => x.faithfulness));
  console.log(row('无依据断言/条', (x) => x.unsupportedClaims, 1));
  console.log(row('预算内占比', (x) => x.withinBudget));
  console.log(row('位置偏移', (x) => x.positionSkew));
  console.log(row('顺序倒退/条', (x) => x.orderInversions, 1));
  console.log(row('重复取材/条', (x) => x.duplicateSources, 1));
  for (const mode of COHERENCE_MODES) console.log(row(`连贯·${mode}`, (x) => x.coherence[mode]));

  console.log(`\n  成对盲比：赢 ${s.wins} · 输 ${s.losses} · 平 ${s.ties}${s.failedRuns ? ` · 失败 ${s.failedRuns}` : ''}`);
  if (s.regressions.length > 0) console.log(`  护栏指标下降：${s.regressions.join('、')}`);
  if (s.candidate.paths < MIN_PATHS) console.log(`  只有 ${s.candidate.paths} 条新 path，少于 ${MIN_PATHS} 条不下结论`);
  console.log(`\n结论：${{ better: '变好了', worse: '变差了', unclear: '看不出差别' }[s.verdict]}`);
}

const flag = (args: readonly string[], name: string): string | undefined => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

function usage(message?: string): void {
  if (message) console.error(`${message}\n`);
  console.log(`用法：bun run eval [书的 id … | --all] [--runs 3] [--against <评测 id>]

在库里已有的章节笔记上重跑 classify + reduce，给新 path 打分，并和基线逐一盲比。
不指定书就评固定书单 scripts/eval-set.json（${EVAL_SET.map((b) => b.title).join('、')}），--all 评全库；
基线默认是书架上现有的 path。
模型取自应用的设置，评审和生成用同一个模型。结果写在 ${EVAL_DIR}。`);
  process.exit(message ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(`\n失败：${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

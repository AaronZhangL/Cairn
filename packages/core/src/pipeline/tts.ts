/**
 * TTS stage: narration script -> mp3 + per-sentence timing.
 *
 * Uses the `edge-tts` CLI, which is free and needs no key. Its SRT output is
 * already split per sentence with timestamps, which is exactly the granularity
 * NarrationCue needs — no word-boundary aggregation required.
 *
 * Not the browser's SpeechSynthesis: its voice varies by operating system, so
 * the same deck would sound different on different machines.
 */
import { readdir, mkdir, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { DraftDeck, NarrationCue, NodeDeck, Slide } from '../types';

/** Microsoft tunes this voice for audiobooks and commentary. */
export const DEFAULT_VOICE = 'zh-CN-YunjianNeural';

/**
 * Measured, not guessed: three Chinese samples through zh-CN-YunjianNeural at
 * default rate gave 4.59 / 4.85 / 5.18 chars per second. Re-measure if the voice
 * or rate changes — station length is derived from this number.
 */
export const CHARS_PER_SECOND = 4.9;

/** How many narration characters fill a station of the given length. */
export function targetChars(minutes: number): number {
  return Math.round(minutes * 60 * CHARS_PER_SECOND);
}

/** Predicted duration before synthesis, for progress display. */
export function estimateMs(text: string): number {
  return Math.round((text.length / CHARS_PER_SECOND) * 1000);
}

/**
 * Where to look for the `edge-tts` binary.
 *
 * PATH alone is not enough: a GUI-launched app inherits a minimal environment,
 * and a pip-installed tool usually sits in a version manager's directory that
 * only an interactive shell puts on PATH. Getting this wrong is expensive in a
 * way that is not obvious — synthesis runs *after* the slides call, so every
 * missing binary costs a model call per attempt before it fails.
 */
export function candidateDirs(home = homedir()): readonly string[] {
  return [
    join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.pyenv', 'shims'),
  ];
}

let resolved: string | undefined;

/** The binary to spawn, or nothing when it is not installed anywhere we look. */
export async function findEdgeTts(): Promise<string | undefined> {
  if (resolved) return resolved;

  const override = process.env.CAIRN_EDGE_TTS;
  if (override) return (resolved = override);

  const onPath = Bun.which('edge-tts');
  if (onPath) return (resolved = onPath);

  for (const dir of [...candidateDirs(), ...(await pyenvBinDirs())]) {
    const candidate = join(dir, 'edge-tts');
    if (await Bun.file(candidate).exists()) return (resolved = candidate);
  }
  return undefined;
}

/** Every pyenv version's bin, because the tool may not be in the active one. */
async function pyenvBinDirs(home = homedir()): Promise<readonly string[]> {
  const versions = join(home, '.pyenv', 'versions');
  try {
    const entries = await readdir(versions);
    return entries.map((v) => join(versions, v, 'bin'));
  } catch {
    return [];
  }
}

/**
 * Checked before the first model call, not at synthesis time.
 *
 * A run that cannot speak is worth nothing, and finding that out one station at
 * a time means paying for the whole book first.
 */
export async function ensureEdgeTts(): Promise<string> {
  const found = await findEdgeTts();
  if (found) return found;
  throw new Error(
    '找不到 edge-tts，无法合成旁白。装一个（pip install edge-tts）'
    + '，或把可执行文件路径写进 CAIRN_EDGE_TTS 环境变量。',
  );
}

export interface TtsOptions {
  readonly voice?: string;
  readonly signal?: AbortSignal;
}

export async function synthesize(
  deck: DraftDeck,
  audioPath: string,
  options: TtsOptions = {},
): Promise<NodeDeck> {
  const text = deck.sentences.join('');
  const srtPath = `${audioPath}.srt`;

  await mkdir(dirname(audioPath), { recursive: true });
  await runEdgeTts(text, audioPath, srtPath, options);

  const cues = parseSrt(await readFile(srtPath, 'utf8'));
  await rm(srtPath, { force: true });

  if (cues.length === 0) throw new Error('edge-tts 未产出字幕时间轴');

  const narration = alignSentences(deck.sentences, cues);
  const durationMs = narration[narration.length - 1]?.endMs ?? 0;

  return {
    nodeId: deck.nodeId,
    audioPath,
    durationMs,
    narration,
    slides: deck.slides.map(({ slide, atSentence }) => ({
      ...slide,
      atMs: narration[Math.min(atSentence, narration.length - 1)]?.startMs ?? 0,
    })) as readonly (Slide & { atMs: number })[],
  };
}

async function runEdgeTts(
  text: string,
  audioPath: string,
  srtPath: string,
  options: TtsOptions,
): Promise<void> {
  const child = Bun.spawn(
    [await ensureEdgeTts(), '--voice', options.voice ?? DEFAULT_VOICE,
     '--write-media', audioPath, '--write-subtitles', srtPath, '--text', text],
    { stdout: 'ignore', stderr: 'pipe' },
  );
  const onAbort = (): void => child.kill();
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    if (await child.exited !== 0) {
      throw new Error(`edge-tts 失败：${(await new Response(child.stderr).text()).slice(-300)}`);
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}

interface SrtCue {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

export function parseSrt(srt: string): readonly SrtCue[] {
  const cues: SrtCue[] = [];

  for (const block of srt.trim().split(/\n\s*\n/)) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const timing = lines.find((l) => l.includes('-->'));
    if (!timing) continue;

    const [from, to] = timing.split('-->').map((t) => parseTimestamp(t.trim()));
    if (from === undefined || to === undefined) continue;

    const text = lines.slice(lines.indexOf(timing) + 1).join('').trim();
    if (text.length > 0) cues.push({ text, startMs: from, endMs: to });
  }

  // edge-tts sometimes emits a cue that ends after the next one starts
  return cues.map((c, i) => {
    const next = cues[i + 1];
    return next && c.endMs > next.startMs ? { ...c, endMs: next.startMs } : c;
  });
}

function parseTimestamp(value: string): number | undefined {
  const m = value.match(/(\d+):(\d{2}):(\d{2})[,.](\d{1,3})/);
  if (!m) return undefined;
  return Number(m[1]) * 3_600_000 + Number(m[2]) * 60_000 + Number(m[3]) * 1000 + Number(m[4]);
}

/**
 * Map our sentences onto edge-tts's cues.
 *
 * edge-tts splits on its own rules, so cue boundaries need not match ours. Both
 * cover the same characters in the same order, so each sentence is located by
 * cumulative character offset and takes the timing of the cue containing it.
 */
export function alignSentences(
  sentences: readonly string[],
  cues: readonly SrtCue[],
): readonly NarrationCue[] {
  const bounds: { start: number; end: number; cue: SrtCue }[] = [];
  let at = 0;
  for (const cue of cues) {
    bounds.push({ start: at, end: at + cue.text.length, cue });
    at += cue.text.length;
  }

  const result: NarrationCue[] = [];
  let offset = 0;

  for (const sentence of sentences) {
    const mid = offset + Math.floor(sentence.length / 2);
    const hit = bounds.find((b) => mid >= b.start && mid < b.end) ?? bounds[bounds.length - 1]!;
    result.push({ text: sentence, startMs: hit.cue.startMs, endMs: hit.cue.endMs });
    offset += sentence.length;
  }

  // Keep cues monotonic: a sentence never starts before the one before it
  return result.map((c, i) => {
    const prev = result[i - 1];
    return prev && c.startMs < prev.startMs ? { ...c, startMs: prev.startMs } : c;
  });
}

export function deckAudioPath(outDir: string, nodeId: string): string {
  return join(outDir, `${nodeId}.mp3`);
}

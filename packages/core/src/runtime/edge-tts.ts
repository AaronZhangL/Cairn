/**
 * The `edge-tts` CLI behind the `Narrator` interface.
 *
 * Free and needs no key. Its SRT output is already split per sentence with
 * timestamps, which is exactly the granularity NarrationCue needs — no
 * word-boundary aggregation required.
 *
 * Everything here spawns a process or touches the disk. That is why it lives in
 * `runtime/` and not in `pipeline/`: the stage's contract is `Narrator`, and
 * this is one implementation of it.
 */
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname } from 'node:path';
import type { DraftDeck, NodeDeck } from '../types';
import {
  assembleDeck, DEFAULT_VOICE, type Narrator, parseSrt, type TtsOptions,
} from '../pipeline/tts';
import { CairnError } from '../errors';

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
    `${home}/.local/bin`,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    `${home}/.pyenv/shims`,
  ];
}

let resolved: string | undefined;

/**
 * Drop the memoised path.
 *
 * The lookup is cached because it stats a dozen directories, but "I just
 * installed it, look again" has to be answerable without restarting the app —
 * which is what the engine row in settings offers.
 */
export function forgetEdgeTts(): void {
  resolved = undefined;
}

/** The binary to spawn, or nothing when it is not installed anywhere we look. */
export async function findEdgeTts(): Promise<string | undefined> {
  if (resolved) return resolved;

  const override = process.env.CAIRN_EDGE_TTS;
  if (override) return (resolved = override);

  const onPath = Bun.which('edge-tts');
  if (onPath) return (resolved = onPath);

  for (const dir of [...candidateDirs(), ...(await pyenvBinDirs())]) {
    const candidate = `${dir}/edge-tts`;
    if (await Bun.file(candidate).exists()) return (resolved = candidate);
  }
  return undefined;
}

/** Every pyenv version's bin, because the tool may not be in the active one. */
async function pyenvBinDirs(home = homedir()): Promise<readonly string[]> {
  const versions = `${home}/.pyenv/versions`;
  try {
    const entries = await readdir(versions);
    return entries.map((v) => `${versions}/${v}/bin`);
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
  throw new CairnError('tts_missing');
}

export function edgeTtsNarrator(defaults: TtsOptions = {}): Narrator {
  return {
    name: 'edge-tts',

    async ensureReady() {
      await ensureEdgeTts();
    },

    speak: (deck, audioPath, options) =>
      synthesize(deck, audioPath, { ...defaults, ...options }),
  };
}

/**
 * Speak a few words, for auditioning a voice.
 *
 * No subtitles and no deck: the reader is judging how a voice sounds, and the
 * sample is written wherever the caller can serve it from.
 */
export async function speakSample(
  text: string,
  voice: string,
  audioPath: string,
): Promise<void> {
  await mkdir(dirname(audioPath), { recursive: true });
  const child = Bun.spawn(
    [await ensureEdgeTts(), '--voice', voice, '--write-media', audioPath, '--text', text],
    { stdout: 'ignore', stderr: 'pipe' },
  );
  if (await child.exited !== 0) {
    throw new CairnError('tts_failed', {}, (await new Response(child.stderr).text()).slice(-300));
  }
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

  if (cues.length === 0) throw new CairnError('tts_no_cues');

  return assembleDeck(deck, cues, audioPath);
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
      throw new CairnError('tts_failed', {}, (await new Response(child.stderr).text()).slice(-300));
    }
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/**
 * TTS stage: narration script -> mp3 + per-sentence timing.
 *
 * This file is the *pure* half — sizing, SRT parsing, sentence alignment and
 * deck assembly, none of which touch the file system or spawn anything. The
 * half that does lives in `runtime/edge-tts.ts` behind the `Narrator` interface
 * below, for the same reason model calls live behind `LlmProvider`: a stage
 * that shells out cannot be tested without the tool installed, and a domain
 * package that spawns processes is not a domain package.
 *
 * Not the browser's SpeechSynthesis: its voice varies by operating system, so
 * the same deck would sound different on different machines.
 */
import { join } from 'node:path';
import type { ContentLocale } from '../parse/language';
import type { DraftDeck, NarrationCue, NodeDeck, Slide } from '../types';
import { CairnError } from '../errors';

// Re-exported so existing importers keep working; defined in `voice.ts`,
// which the renderer can bundle and this file cannot.
export { DEFAULT_VOICE, DEFAULT_VOICES, defaultVoiceFor } from './voice';

// Speech rates and the length targets derived from them live in `voice.ts`,
// for the same reason the default voices do: the renderer bundles them.
export {
  CHARS_PER_SECOND, estimateMs, targetChars, targetWords, WORDS_PER_SECOND,
} from './voice';

export interface TtsOptions {
  readonly voice?: string;
  readonly signal?: AbortSignal;
}

/**
 * What the build stage needs from a voice. The mirror of `LlmProvider`: swap the
 * implementation and nothing upstream changes.
 *
 * `ensureReady` is separate from `speak` on purpose — a run that cannot speak is
 * worth nothing, and finding that out one station at a time means paying for the
 * whole book's slides first.
 */
export interface Narrator {
  readonly name: string;
  /** Throws with a human-actionable message when the voice cannot run at all. */
  ensureReady(): Promise<void>;
  speak(deck: DraftDeck, audioPath: string, options?: TtsOptions): Promise<NodeDeck>;
}

export interface SrtCue {
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

/**
 * Put the timed deck together. Pure, so the mapping from cues to slide times is
 * testable without synthesizing anything.
 */
export function assembleDeck(
  deck: DraftDeck,
  cues: readonly SrtCue[],
  audioPath: string,
): NodeDeck {
  if (cues.length === 0) throw new CairnError('tts_unaligned');

  const narration = alignSentences(deck.sentences, cues);

  return {
    nodeId: deck.nodeId,
    audioPath,
    durationMs: narration[narration.length - 1]?.endMs ?? 0,
    narration,
    slides: deck.slides.map(({ slide, atSentence }) => ({
      ...slide,
      atMs: narration[Math.min(atSentence, narration.length - 1)]?.startMs ?? 0,
    })) as readonly (Slide & { atMs: number })[],
  };
}

/** `key` is a content fingerprint (see `build.ts`), not a station id: one audio
 *  directory is shared by every budget, so a positional name collides. */
export function deckAudioPath(outDir: string, key: string): string {
  return join(outDir, `${key}.mp3`);
}

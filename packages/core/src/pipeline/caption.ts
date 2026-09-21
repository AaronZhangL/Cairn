/**
 * Narration cues -> on-screen captions.
 *
 * A NarrationCue is one whole sentence, which is the right unit for the script
 * but the wrong unit for a subtitle: a 40-character sentence lands as a wall of
 * text and is gone before it can be read. Video editors cut at the clause, not
 * the sentence — the same rule the Jianying subtitle flow uses (split on
 * 。！？，、：, drop the trailing punctuation, one clause per card).
 *
 * Two things are kept from that approach and one is added:
 *   - break at punctuation, never mid-phrase
 *   - the displayed line carries no trailing punctuation (the pause is the cut)
 *   - a lower bound as well as an upper one, because a two-character flash is
 *     harder to read than a long line
 *
 * Timing is split inside the sentence in proportion to character count. The SRT
 * from edge-tts is only sentence-grained, so this is an estimate; it is stable
 * because narration is read at a near-constant rate (see CHARS_PER_SECOND).
 */
import type { NarrationCue } from '../types';

export interface Caption {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
  /** Index of the narration cue this line came from, for anchoring a question. */
  readonly cueIdx: number;
}

/** Roughly two lines at the stage's caption size. Past this, reading lags the voice. */
export const MAX_UNITS = 20;
/** Below this a line is merged forward: a flash of three characters reads as a glitch. */
export const MIN_UNITS = 6;
/** No caption is worth showing for less than this, however short its text. */
export const MIN_MS = 700;

/** Sentence-ending marks: always a cut, if the line is long enough. */
const STRONG = /[。！？；…!?;]/;
/** Clause marks: a cut when the line is getting long. */
const WEAK = /[，、：,:]/;

/**
 * Display width, not character count: Latin is half as wide as CJK at the same
 * point size, so "GitHub Actions" must not count as 14 units of a 20-unit line.
 */
export function units(text: string): number {
  let total = 0;
  for (const ch of text) {
    total += /[一-鿿぀-ヿ　-〿＀-￯]/.test(ch) ? 1 : 0.5;
  }
  return total;
}

/** Trailing punctuation is the cut itself — showing it wastes width. */
function trim(text: string): string {
  return text.replace(/^[\s]+|[\s，、：,:。！？；…!?;]+$/gu, '');
}

/**
 * Split one sentence into pieces that each end at a punctuation mark (the final
 * piece may not). Punctuation stays attached so the piece keeps its own weight.
 */
function pieces(text: string): readonly string[] {
  const out: string[] = [];
  let at = '';

  for (const ch of text) {
    at += ch;
    if (STRONG.test(ch) || WEAK.test(ch)) {
      out.push(at);
      at = '';
    }
  }
  if (at.length > 0) out.push(at);
  return out;
}

/**
 * A piece longer than a whole line has no punctuation to cut at, so it is cut on
 * width — into equal parts rather than greedily, which would leave the last line
 * an orphan of two words.
 */
function hardWrap(piece: string): readonly string[] {
  const total = units(piece);
  if (total <= MAX_UNITS) return [piece];

  const parts = Math.ceil(total / MAX_UNITS);
  const target = total / parts;

  const out: string[] = [];
  let at = '';
  for (const ch of piece) {
    // Never cut inside a Latin word; wait for the space that follows it
    if (units(at) >= target && !/[A-Za-z0-9'’-]/.test(ch) && out.length < parts - 1) {
      out.push(at);
      at = '';
    }
    at += ch;
  }
  if (at.trim().length > 0) out.push(at);
  return out;
}

/** Group pieces into lines: cut at punctuation once a line has enough on it. */
function lines(text: string): readonly string[] {
  const out: string[] = [];
  let at = '';

  for (const piece of pieces(text).flatMap(hardWrap)) {
    const merged = at + piece;
    if (at.length > 0 && units(merged) > MAX_UNITS) {
      out.push(at);
      at = piece;
      continue;
    }
    at = merged;
    const last = piece.trim().slice(-1);
    // A sentence end cuts as soon as the line is worth showing on its own
    if (STRONG.test(last) && units(at) >= MIN_UNITS) {
      out.push(at);
      at = '';
    }
  }
  if (at.trim().length > 0) out.push(at);

  return mergeShort(out);
}

/** Fold a too-short line into its neighbour rather than flashing it alone. */
function mergeShort(input: readonly string[]): readonly string[] {
  const out: string[] = [];

  for (const line of input) {
    const prev = out[out.length - 1];
    const tooShort = units(line) < MIN_UNITS;
    if (prev !== undefined && tooShort && units(prev + line) <= MAX_UNITS * 1.5) {
      out[out.length - 1] = prev + line;
    } else {
      out.push(line);
    }
  }

  // A short first line has no previous to fold into; give it the next one
  if (out.length > 1 && units(out[0]!) < MIN_UNITS) {
    const [first, second, ...rest] = out;
    return [first! + second!, ...rest];
  }
  return out;
}

/**
 * One caption per clause, timed inside its sentence by character share.
 *
 * Cue boundaries are never crossed: a caption that spanned two sentences would
 * outlive the slide its sentence triggered.
 */
export function toCaptions(narration: readonly NarrationCue[]): readonly Caption[] {
  const out: Caption[] = [];

  narration.forEach((cue, cueIdx) => {
    const parts = lines(cue.text);
    const total = parts.reduce((sum, p) => sum + p.length, 0);
    const span = Math.max(0, cue.endMs - cue.startMs);

    let at = cue.startMs;
    parts.forEach((part, i) => {
      const share = total > 0 ? (part.length / total) * span : 0;
      const end = i === parts.length - 1 ? cue.endMs : Math.round(at + share);
      const text = trim(part);
      if (text.length > 0) out.push({ text, startMs: Math.round(at), endMs: end, cueIdx });
      at = end;
    });
  });

  return stretchShort(out);
}

/**
 * Give a caption that would blink past its minimum, by borrowing from the next
 * one. Overlap is harmless — the player shows the last caption that has started.
 */
function stretchShort(input: readonly Caption[]): readonly Caption[] {
  return input.map((c, i) => {
    const next = input[i + 1];
    if (c.endMs - c.startMs >= MIN_MS) return c;
    const limit = next ? next.endMs : c.startMs + MIN_MS;
    return { ...c, endMs: Math.min(limit, c.startMs + MIN_MS) };
  });
}

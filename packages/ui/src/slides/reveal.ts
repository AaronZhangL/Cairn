/**
 * How much of a slide has been revealed at a given moment.
 *
 * A slide whose items all appear at once is read in two seconds and then sits
 * there; revealing in step with the voice keeps the two together. The step is
 * taken from the narration, not a timer, because speech pace is not uniform —
 * and, where the line can be found, from the moment that item is actually
 * spoken, because evenly spaced beats put a card on screen after the sentence
 * that introduced it. See DESIGN.md.
 */

/**
 * How far ahead of the audio the picture is drawn.
 *
 * ITU-R BT.1359-1 puts the detectability thresholds at about -45ms to +125ms,
 * where the wide side is *video first*: the brain expects sound to arrive after
 * sight and barely notices, while a picture that lands after its sound is
 * caught at 45ms. So the target is not zero — it is slightly early, which also
 * absorbs the frame quantisation and the output latency underneath it.
 */
export const LEAD_MS = 90;

/** The last mark at or before `ms`; 0 when none has passed. Marks must ascend. */
export function lastIndexAtOrBefore(marks: readonly number[], ms: number): number {
  let found = 0;
  for (let i = 0; i < marks.length; i += 1) {
    if (marks[i]! <= ms) found = i;
    else break;
  }
  return found;
}

/** A narration line and when it starts. Captions, not sentences: finer is better here. */
export interface Cue {
  readonly text: string;
  readonly startMs: number;
}

/** One item's text, or the several phrasings any of which counts as naming it. */
export type Phrase = string | readonly string[];

/**
 * Shortest shared run that counts as a mention, by how long the phrase is.
 *
 * Short phrases are deliberate labels — a pane titled 目标导向 is named by a
 * sentence that says 目标 — so two characters are meant. Long ones are whole
 * claims, where two characters would match anything.
 */
function minRun(length: number): number {
  return length <= 8 ? 2 : Math.min(5, Math.ceil(length / 4));
}

/** Whether a phrase is written in a script with no spaces between its words. */
function isUnspaced(text: string): boolean {
  const cjk = (text.match(/[一-鿿㐀-䶿]/gu) ?? []).length;
  return cjk * 2 >= [...text].length;
}

/** Words worth matching on. Short ones ("the", "of") name nothing by themselves. */
const MEANINGFUL = 4;

function words(text: string): readonly string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

/**
 * Whether a spaced phrase is named, by sharing a whole word.
 *
 * Not a character run, which is what the CJK path uses: Chinese has no word
 * boundaries, so a run is the only handle there is. English has boundaries, and
 * ignoring them matched "Change management" against "This changes nothing" on
 * the four letters inside "c-hang-es" — an item lighting up at the wrong moment,
 * silently, and only ever on English books.
 */
function namesSpaced(cue: string, phrase: string): boolean {
  const needle = words(phrase);
  if (needle.length === 0) return false;
  const haystack = new Set(words(cue));

  const meaningful = needle.filter((w) => w.length >= MEANINGFUL);
  // An acronym or a short proper noun is the whole phrase; match it as it is
  const wanted = meaningful.length > 0 ? meaningful : needle;
  return wanted.some((w) => haystack.has(w));
}

/** Punctuation and spacing differ between a slide and the script; the words do not. */
function bare(text: string): string {
  return text.replace(/[\s　-〿！-･!-/:-@[-`{-~]+/gu, '');
}

/** Whether `cue` names `phrase`, by any run of characters long enough to be meant. */
export function names(cue: string, phrase: Phrase): boolean {
  const haystack = bare(cue);
  if (haystack.length === 0) return false;

  for (const option of typeof phrase === 'string' ? [phrase] : phrase) {
    // Spaced scripts have word boundaries; the run-matching below exists only
    // because Chinese does not, and applying it to English matches inside words.
    if (!isUnspaced(option)) {
      if (namesSpaced(cue, option)) return true;
      continue;
    }
    const needle = bare(option);
    if (needle.length === 0) continue;
    const run = minRun(needle.length);
    if (needle.length <= run) {
      if (haystack.includes(needle)) return true;
      continue;
    }
    for (let i = 0; i + run <= needle.length; i += 1) {
      if (haystack.includes(needle.slice(i, i + run))) return true;
    }
  }
  return false;
}

/**
 * When each item should appear, in ms on the deck's timeline.
 *
 * The first item is always at the span's start: a slide that opens empty reads
 * as a loading failure. Later items take the moment they are named, or an even
 * share of the span when they are named nowhere, and never move earlier than
 * the item before them.
 */
export function itemBeats(
  items: readonly Phrase[],
  cues: readonly Cue[],
  spanStartMs: number,
  spanEndMs: number,
): readonly number[] {
  const span = Math.max(0, spanEndMs - spanStartMs);
  const inside = cues.filter((c) => c.startMs > spanStartMs && c.startMs < spanEndMs);

  const beats: number[] = [];
  for (const [i, item] of items.entries()) {
    const even = spanStartMs + (span * i) / Math.max(1, items.length);
    const spoken = inside.find((c) => names(c.text, item))?.startMs;
    const wanted = i === 0 ? spanStartMs : (spoken ?? even);
    beats.push(Math.max(wanted, beats[i - 1] ?? spanStartMs));
  }
  return beats;
}

/** How many of `items` are on screen at `ms`. Always at least one. */
export function revealShown(
  items: readonly Phrase[],
  cues: readonly Cue[],
  spanStartMs: number,
  spanEndMs: number,
  ms: number,
): number {
  if (items.length === 0) return 0;
  const beats = itemBeats(items, cues, spanStartMs, spanEndMs);
  let shown = 1;
  for (let i = 1; i < items.length; i += 1) if ((beats[i] ?? Infinity) <= ms) shown = i + 1;
  return shown;
}

/** How many of `total` items a plain 0..1 progress shows. The static fallback. */
export function revealCount(total: number, progress: number): number {
  if (total <= 0) return 0;
  const shown = 1 + Math.floor(clamp01(progress) * total);
  return Math.min(shown, total);
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

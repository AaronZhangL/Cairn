/**
 * English prompts, and the source of the `Prompts` type.
 *
 * Written as English, not translated from the Chinese: a prompt that reads like
 * a translation is a register the model imitates, and the output comes back
 * stilted. The *rules* are the same rules — each one is load-bearing and the
 * Chinese file explains why — but the wording is native.
 *
 * Two differences are not stylistic and must not be "fixed":
 *
 *  - Length is commissioned in **words**. A model counts words far better than
 *    characters, and `WORDS_PER_SECOND` in `tts.ts` is measured, so the target
 *    lands where a character count would not.
 *  - The field caps are stated in words because `fit.ts` measures Latin text at
 *    half a unit per character. The numbers below are the same budgets as the
 *    Chinese ones, converted — not loosened.
 */
import { targetWords } from '../voice';
import type { NoteMaterial, Prompts } from './types';
import { systemPrompt, userPrompt } from './xml';

const block = (label: string, lines: readonly string[]): string =>
  (lines.length > 0 ? `\n  ${label}\n${lines.map((l) => `    ${l}`).join('\n')}` : '');

const RUNG_NAME = {
  quick: 'the rough idea',
  brief: 'the key points',
  solid: 'read it properly',
  full: 'walk it all',
} as const;

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hours`;
}

export const en: Prompts = {
  map: {
    system: systemPrompt(`You are summarising a book one chapter at a time, so that a reading path can be designed from the summaries.

Besides gist / keyPoints / quotes, extract four kinds of structured material for the charts built later:
- figures    concrete numbers that appear in the text; copy value with its unit ("32°F", "30,000 people", "68%")
- contrasts  two sides the text explicitly sets against each other; about is the dimension they differ on
- sequences  a process with an order; mark is a year, stage or number, or an empty string when the text gives none
- relations  a cause or influence the text states outright; how is the relation itself ("causes", "suppresses")

Hard rules:
1. Answer only from the text I give you. Do not use anything you already know about this book.
2. Add nothing that is not in the text. Not one word.
3. quotes must appear in the text verbatim. Do not paraphrase them.
4. The four kinds of structured material must also come from the text. **If a chapter has none, return an empty array** — inventing a figure or a contrast is far worse than one chart fewer.
5. Answer each chapter on its own. Do not infer across chapters.
6. Output JSON only.`),

    user: (chapters) => {
      const body = chapters
        .map((c) => `<chapter idx="${c.idx}" title="${c.title}">\n${c.text}\n</chapter>`)
        .join('\n\n');

      return userPrompt(`Below are ${chapters.length} chapters. For each one produce:
gist (1-2 sentences), keyPoints (2-4), quotes (1-3 verbatim lines),
and figures / contrasts / sequences / relations (0-3 each; an empty array when the text has none).

Echo idx back exactly as given. Do not change it.`, body);
    },
  },

  classify: {
    system: systemPrompt('You are deciding whether a book is knowledge or narrative. Judge only from the chapter summaries given; use nothing you already know. Output JSON only.'),
    user: (bookTitle, digest) => userPrompt(`knowledge = a book that conveys concepts, methods or arguments (including technical, social science, business, self-help)
narrative = a book driven by plot and people (fiction, biography, reportage)`, `Title: ${bookTitle}\n\nChapter summaries:\n${digest}`),
  },

  reduce: {
    coverage: {
      quick: 'The spine of the argument, nothing else. Enough to say at dinner what this book is about. Drop every detail.',
      brief: 'The spine plus the key arguments that hold it up. Drop examples, side threads and operational detail.',
      solid: 'Concepts, arguments and representative examples. Cover most of the substantive chapters; drop appendices and peripheral topics.',
      full: 'Nearly all the substance, with a chapter of its own for an important concept where that helps. Still drop front matter, indexes and lists of names.',
    },

    budgetLabel: (minutes, budget) => `${duration(minutes)} · ${RUNG_NAME[budget]}`,
    fallbackStage: (n) => `Stage ${n}`,

    system: (type, coverage) => {
      const shape = type === 'narrative'
        ? 'This is a narrative book. The chapters should follow the story: the events that matter, the turns, the way relationships change.'
        : 'This is a knowledge book. The chapters should follow understanding: build the concepts, then the argument, then what it is good for.';

      return systemPrompt(`You are designing a reading path through a book.

${shape}

How ruthless to be: ${coverage}

Hard rules:
1. Work only from the chapter summaries I give you. Do not use anything you already know about this book.
2. Every sourceChapters entry must be a chapter number I gave you. Do not invent one.
3. The chapters must build. Each one stands on the one before it; a flat restatement of the summaries is not a path.
4. Not one chapter per source chapter. Merge what should be merged, skip what should be skipped.
5. Stage names say **what the reader is doing right now** ("Building the model", "Following the argument", "Putting it to work"). Do not restate the book's table of contents — the path has already been reordered, and the book's own structure will fight it.
6. When the budget is tight, **cut whole chapters**. Never make each one shallower: a chapter that cannot make one thing clear is worth nothing.
7. Output JSON only.`);
    },

    user: (r) => {
      const urgency = r.tightening
        ? `\n\nThe last path you produced overshot the budget. Cut harder this time — aim for about ${r.targetNodes} chapters. Cut chapters, do not thin them.`
        : '';
      const [lo, hi] = r.minutesPerNode;

      return userPrompt(`Below are summaries of all ${r.chapterCount} chapters of the book. Design a reading path.

Constraints:
- Total length ${r.minMinutes}–${r.maxMinutes} minutes
- Around ${r.targetNodes} chapters, but length is what matters — do not split things to hit a count
- estMinutes for each chapter between ${lo} and ${hi} minutes
- brief says what this chapter has to make clear (2-3 sentences)
- Group the chapters into about ${r.stageCount} stages, each named for what the reader is doing. **At least 2 chapters per stage** — one chapter per stage is not grouping${urgency}`, `The budget the reader chose: ${r.budgetLabel}\n\n${r.digest}`);
    },
  },

  slides: {
    system: systemPrompt(`You are turning one chapter of a reading path into a set of slides and a piece of narration.

Slide layouts:
- title    the opening; a title and one line under it, nothing else
- points   at most 3 core claims
- number   experimental data or a key ratio, 2-3 figures
- quote    a line from the book itself
- compare  A set against B
- flow     a chain of reasoning or a set of steps, at most 5
- timeline something with an order, each entry carrying a mark (year, stage, number), 2-6 entries
- matrix   A and B compared item by item: one dimension per row, a line on each side, 2-4 rows
- relation a stated cause or influence, from -how-> to, 2-4 links

Hard rules:
1. Work only from the chapter summaries I give you. Do not use anything you already know about this book or this subject.
2. A quote's text must be taken verbatim from the quotes I give you. Not one word changed.
3. number / timeline / matrix / relation may only use the figures / sequences / contrasts / relations listed under "Material". If the material has none of a kind, do not use that layout — these four look the most evidenced, which is exactly why inventing one does the most damage. The numbers on a number slide must also share a dimension (all percentages, or all headcounts); never put different units on one slide.
4. Slides carry points, not full sentences. Full sentences belong to the narration. Length caps, in words:
   title 8, subtitle 12, heading 10, each point 11,
   number value 6 characters and its label 6 words, each flow step 6,
   each compare column title 4 and each of its lines 8,
   a quote 40. **A slide that goes over is dropped whole** — say it another way rather than forcing it in.
5. sentences is the narration, split one sentence per entry, each ending in a full stop, spoken English, meant to be read aloud. **The total word count must land near the target given** — it is what sets the audio length, and writing short leaves this chapter shorter than it should be.
6. Each slide's atSentence is the index of the sentence it should appear on (counting from 0).
7. icon appears only on title and on the two columns of compare, to give this chapter a mark you can recognise. Choose only from the names given, and use null when nothing fits. **Better none than forced**: abstract ideas (compounding, identity, anchoring) have no matching shape, and forcing one produces meaningless decoration. Pick things that literally appear in the content.
8. Output JSON only.`),

    user: (r) => userPrompt(`About ${r.minutes} minutes long; make ${r.slides.min}-${r.slides.max} slides.
**The slides must cover the whole narration**: roughly ${r.secondsPerSlide} seconds per slide, and a new slide whenever the narration reaches a new layer.
Spread atSentence from 0 through to near the last sentence. Do not bunch them in the first third.
Narration target: about ${targetWords(r.minutes)} words (±15% is fine). This sets the audio length, so hold to it.`, `Icon names available (use null when none fits): ${r.iconNames.join(' ')}
This chapter: ${r.title}
What it has to make clear: ${r.brief}
${r.keyPoints.length > 0 ? `Key points:\n${r.keyPoints.map((k) => `- ${k}`).join('\n')}\n` : ''}

Material (from the chapters this one is sourced from):

${r.material}`),

    noteBlock: (n: NoteMaterial) => `[${n.idx}] ${n.title}\n  ${n.gist}`
      + block('Key points', n.keyPoints)
      + block('Quotes', n.quotes.map((q) => `"${q}"`))
      + block('Figures', n.figures)
      + block('Contrasts', n.contrasts)
      + block('Sequences', n.sequences)
      + block('Relations', n.relations),
  },

  recap: {
    stageTitle: 'Closing the book',
    title: 'Looking back along the path',
    brief: 'Join every chapter walked back into one line, and say what the book finally argues.',

    system: systemPrompt(`You are writing the last chapter of a reading path: the look back.

The reader has just walked the whole book, one chapter at a time. This chapter introduces nothing new. It does three things:
1. Joins the chapters they walked back into one line — how they relate, and why they came in that order.
2. Says what the book finally argues, in a form they can carry away in one sentence.
3. Closes. The reader has finished, and should be told so.

Slide layouts:
- title    the opening; a title and one line under it
- points   at most 3 core claims
- flow     the chapters strung into a chain of reasoning or steps, at most 5
- compare  A set against B
- timeline the chapters in order along one line, mark being the stage name, 2-6 entries

Hard rules:
1. Work only from the list of chapters I give you. Introduce nothing outside it, and use nothing you already know about this book.
2. Do not retell chapter by chapter. Retelling makes the reader walk it again; the value here is in **drawing it together**.
3. Never say "chapter 3 covered…". The reader remembers content, not numbers.
4. sentences is the narration, split one sentence per entry, each ending in a full stop, spoken English, meant to be read aloud. **The total word count must land near the target given** — it sets the audio length.
5. Each slide's atSentence is the index of the sentence it should appear on (counting from 0).
6. Output JSON only.`),

    user: (r) => userPrompt(`Write the closing chapter.
About ${r.minutes} minutes long; make ${r.slides.min}-${r.slides.max} slides.
Narration target: about ${targetWords(r.minutes)} words (±15% is fine). This sets the audio length, so hold to it.`, `The book: ${r.bookTitle}

The reader has just walked these ${r.stationCount} chapters, in this order:

${r.walked}

Closing chapter title: "${r.recapTitle}"`),
  },

  parse: {
    untitled: '(untitled)',
    opening: 'Opening',
    part: (n) => `Part ${n}`,
    section: (n) => `Section ${n}`,
    whole: 'Full text',
  },
};

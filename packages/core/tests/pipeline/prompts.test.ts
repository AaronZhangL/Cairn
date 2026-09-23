import { describe, expect, test } from 'bun:test';
import { CONTENT_LOCALES, type ContentLocale } from '../../src/parse/language';
import { promptsFor } from '../../src/pipeline/prompts';
import { targetChars, targetWords } from '../../src/pipeline/tts';

const SAMPLE_CHAPTERS = [{ idx: 0, title: 'A title', text: 'Some body text.' }];

const SLIDE_REQUEST = {
  title: 'A station',
  brief: 'What it has to make clear.',
  keyPoints: ['one', 'two'],
  minutes: 4,
  slides: { min: 6, max: 10 },
  secondsPerSlide: 22,
  iconNames: ['scale', 'clock'],
  material: '[0] A title\n  A gist.',
};

const REDUCE_REQUEST = {
  digest: '[0] A title\n  A gist.',
  chapterCount: 12,
  budgetLabel: 'whatever',
  minMinutes: 40,
  maxMinutes: 60,
  targetNodes: 11,
  minutesPerNode: [2, 4] as const,
  stageCount: 3,
  tightening: false,
};

const RECAP_REQUEST = {
  bookTitle: 'A book',
  recapTitle: 'Looking back',
  walked: '1. A station',
  stationCount: 6,
  minutes: 3,
  slides: { min: 4, max: 7 },
};

/** Everything a locale must produce, so neither can quietly return nothing. */
function everyString(locale: ContentLocale): Record<string, string> {
  const p = promptsFor(locale);
  return {
    'map.system': p.map.system,
    'map.user': p.map.user(SAMPLE_CHAPTERS),
    'classify.system': p.classify.system,
    'classify.user': p.classify.user('A book', 'digest'),
    'reduce.system': p.reduce.system('knowledge', p.reduce.coverage.brief),
    'reduce.system.narrative': p.reduce.system('narrative', p.reduce.coverage.full),
    'reduce.user': p.reduce.user(REDUCE_REQUEST),
    'reduce.user.tightening': p.reduce.user({ ...REDUCE_REQUEST, tightening: true }),
    'reduce.budgetLabel': p.reduce.budgetLabel(52, 'brief'),
    'reduce.budgetLabel.hours': p.reduce.budgetLabel(120, 'full'),
    'reduce.fallbackStage': p.reduce.fallbackStage(2),
    'slides.system': p.slides.system,
    'slides.user': p.slides.user(SLIDE_REQUEST),
    'slides.noteBlock': p.slides.noteBlock({
      idx: 0, title: 't', gist: 'g', keyPoints: ['k'], quotes: ['q'],
      figures: ['f'], contrasts: ['c'], sequences: ['s'], relations: ['r'],
    }),
    'recap.system': p.recap.system,
    'recap.user': p.recap.user(RECAP_REQUEST),
    'recap.stageTitle': p.recap.stageTitle,
    'recap.title': p.recap.title,
    'recap.brief': p.recap.brief,
    'ask.system': p.ask.system,
    'ask.user': p.ask.user({
      nodeTitle: 'n', brief: 'b', question: 'q', material: 'm',
    }),
    'ask.user.selected': p.ask.user({
      nodeTitle: 'n', brief: 'b', selection: 's', question: 'q', material: 'm',
    }),
    'ask.locatorSystem': p.ask.locatorSystem,
    'ask.locatorUser': p.ask.locatorUser('q', 3, 'index'),
    'ask.notFound': p.ask.notFound,
    'ask.rephrase': p.ask.rephrase,
    'ask.textGone': p.ask.textGone,
    'ask.anchored': p.ask.anchored('s', 'q'),
    'ask.chapterTag': p.ask.chapterTag(3, 't', 'body'),
    'ask.plainUser': p.ask.plainUser('q', 'm'),
    'outside.system': p.outside.system,
    'outside.user': p.outside.user('q', 'r'),
    'outside.nothingFound': p.outside.nothingFound,
    'parse.untitled': p.parse.untitled,
    'parse.opening': p.parse.opening,
    'parse.part': p.parse.part(2),
    'parse.section': p.parse.section(2),
    'parse.whole': p.parse.whole,
  };
}

describe.each([...CONTENT_LOCALES])('%s prompts', (locale) => {
  const all = everyString(locale);

  test('nothing comes back empty', () => {
    expect(Object.entries(all).filter(([, v]) => v.trim() === '').map(([k]) => k)).toEqual([]);
  });

  test('every system prompt ends by demanding JSON', () => {
    // Every stage parses its reply; a system prompt that forgets to say so is
    // how a stage starts failing on prose it cannot parse.
    for (const key of ['map.system', 'classify.system', 'slides.system', 'recap.system', 'ask.system', 'outside.system']) {
      expect(all[key]!.toUpperCase()).toContain('JSON');
    }
    expect(all['reduce.system']!.toUpperCase()).toContain('JSON');
  });

  test('the user prompt carries the material it was given', () => {
    expect(all['slides.user']).toContain(SLIDE_REQUEST.material);
    expect(all['reduce.user']).toContain(REDUCE_REQUEST.digest);
    expect(all['map.user']).toContain('Some body text.');
  });

  test('a tightening retry says so, and a first attempt does not', () => {
    expect(all['reduce.user.tightening']!.length).toBeGreaterThan(all['reduce.user']!.length);
  });

  test('a highlighted passage reaches the prompt', () => {
    expect(all['ask.user.selected']!.length).toBeGreaterThan(all['ask.user']!.length);
  });

  test('the chapter tag wraps the body in a tag of its own', () => {
    expect(all['ask.chapterTag']).toContain('body');
    expect(all['ask.chapterTag']).toMatch(/^<[^>]+>[\s\S]*<\/[^>]+>$/);
  });
});

describe('the two locales stay in step', () => {
  test('both produce exactly the same set of prompts', () => {
    expect(Object.keys(everyString('zh')).sort()).toEqual(Object.keys(everyString('en')).sort());
  });

  /**
   * The difference that is not stylistic: an English prompt asks for words
   * because a model counts words reliably and characters badly, and the two
   * numbers are measured separately in `tts.ts`.
   */
  test('English commissions words, Chinese commissions characters', () => {
    const enSlides = promptsFor('en').slides.user(SLIDE_REQUEST);
    const zhSlides = promptsFor('zh').slides.user(SLIDE_REQUEST);

    expect(enSlides).toContain(String(targetWords(SLIDE_REQUEST.minutes)));
    expect(enSlides).toContain('words');
    expect(zhSlides).toContain(String(targetChars(SLIDE_REQUEST.minutes, 'zh')));
    expect(zhSlides).toContain('字');
  });

  test('the two length targets describe the same duration, not the same count', () => {
    // 4.9 chars/s against 2.9 words/s — a shared number would mean one of them
    // was copied rather than measured.
    expect(targetWords(4)).toBeLessThan(targetChars(4, 'zh'));
    expect(targetChars(4, 'en')).toBeGreaterThan(targetChars(4, 'zh'));
  });

  test('each locale writes its own chapter tag name', () => {
    expect(promptsFor('en').ask.chapterTag(1, 't', 'b')).toContain('<chapter');
    expect(promptsFor('zh').ask.chapterTag(1, 't', 'b')).toContain('<章');
  });
});

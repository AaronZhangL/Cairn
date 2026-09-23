import { describe, expect, test } from 'bun:test';
import {
  itemBeats, lastIndexAtOrBefore, LEAD_MS, names, revealCount, revealShown, type Cue,
} from '../../src/slides/reveal';

const cue = (startMs: number, text: string): Cue => ({ startMs, text });

describe('names', () => {
  test('matches the phrase the narration actually says', () => {
    expect(names('所以体系比目标更可靠', '体系')).toBe(true);
    expect(names('所以体系比目标更可靠', '目标导向')).toBe(true);
  });

  test('ignores punctuation and spacing on either side', () => {
    expect(names('所以，体系、比目标更可靠。', '体系比目标')).toBe(true);
    expect(names('GitHub Actions 会自动跑', 'GitHub  Actions')).toBe(true);
  });

  test('any of several phrasings counts as naming the item', () => {
    expect(names('冰在三十二度开始融化', ['第一条', '三十二度'])).toBe(true);
  });

  test('a long claim needs more than two shared characters', () => {
    // Two characters is meant in a label and meaningless in a sentence.
    expect(names('今天天气不错，和这件事没有关系', '身份认同会反过来强化行为本身')).toBe(false);
    expect(names('', '体系')).toBe(false);
  });
});

describe('itemBeats', () => {
  const cues = [cue(0, '先说目标'), cue(4000, '再说体系'), cue(8000, '最后是身份')];

  /** The bug this fixes: the voice had said 体系 and its card was still absent. */
  test('an item appears when it is named, not on an even share of the span', () => {
    const beats = itemBeats(['目标', '体系', '身份'], cues, 0, 12_000);
    expect(beats[1]).toBe(4000);
    expect(beats[2]).toBe(8000);
  });

  test('the first item is always there: a slide that opens empty reads as a failure', () => {
    expect(itemBeats(['甲', '乙'], cues, 0, 12_000)[0]).toBe(0);
  });

  test('an item nobody names falls back to an even share of the span', () => {
    const beats = itemBeats(['目标', '没人提到的一条'], [cue(0, '先说目标')], 0, 10_000);
    expect(beats[1]).toBe(5000);
  });

  test('never moves an item earlier than the one before it', () => {
    // 身份 is spoken before 体系 here; the cards must still arrive in order.
    const jumbled = [cue(2000, '先谈身份'), cue(6000, '再谈体系')];
    const beats = itemBeats(['开头', '体系', '身份'], jumbled, 0, 10_000);
    expect(beats[2]).toBeGreaterThanOrEqual(beats[1]!);
  });

  test('only cues inside this slide span count', () => {
    const outside = [cue(500, '说体系'), cue(9000, '说体系')];
    expect(itemBeats(['甲', '体系'], outside, 1000, 12_000)[1]).toBe(9000);
  });
});

describe('revealShown', () => {
  const cues = [cue(0, '先说目标'), cue(4000, '再说体系')];

  test('counts the items whose moment has arrived', () => {
    expect(revealShown(['目标', '体系'], cues, 0, 8000, 0)).toBe(1);
    expect(revealShown(['目标', '体系'], cues, 0, 8000, 3999)).toBe(1);
    expect(revealShown(['目标', '体系'], cues, 0, 8000, 4000)).toBe(2);
  });

  test('scrubbing backwards folds the slide up again', () => {
    expect(revealShown(['目标', '体系'], cues, 0, 8000, 7000)).toBe(2);
    expect(revealShown(['目标', '体系'], cues, 0, 8000, 100)).toBe(1);
  });

  test('is 0 for a slide with no items to build', () => {
    expect(revealShown([], cues, 0, 8000, 5000)).toBe(0);
  });
});

describe('revealCount', () => {
  test('is the static fallback: a still shows the finished slide', () => {
    expect(revealCount(3, 1)).toBe(3);
    expect(revealCount(3, 0)).toBe(1);
    expect(revealCount(0, 1)).toBe(0);
  });
});

describe('lastIndexAtOrBefore', () => {
  const marks = [0, 4000, 9000];

  test('holds the last mark that has passed', () => {
    expect(lastIndexAtOrBefore(marks, 0)).toBe(0);
    expect(lastIndexAtOrBefore(marks, 3999)).toBe(0);
    expect(lastIndexAtOrBefore(marks, 4000)).toBe(1);
    expect(lastIndexAtOrBefore(marks, 99_000)).toBe(2);
  });

  test('before the first mark it still shows something', () => {
    expect(lastIndexAtOrBefore([500, 4000], 0)).toBe(0);
  });

  test('is 0 for an empty timeline rather than -1', () => {
    expect(lastIndexAtOrBefore([], 1000)).toBe(0);
  });
});

describe('LEAD_MS', () => {
  /**
   * The bug this fixes: everything on screen was read at the raw audio position
   * and arrived after its own sound. BT.1359-1 catches a late picture at ~45ms
   * and tolerates an early one to ~125ms, so the target is early, not exact.
   */
  test('is early enough to be on the right side of the sound', () => {
    expect(LEAD_MS).toBeGreaterThanOrEqual(45);
  });

  test('is not so early that the picture runs ahead visibly', () => {
    expect(LEAD_MS).toBeLessThanOrEqual(125);
  });

  test('brings a slide forward by its own margin', () => {
    const marks = [0, 4000];
    expect(lastIndexAtOrBefore(marks, 3950)).toBe(0);
    expect(lastIndexAtOrBefore(marks, 3950 + LEAD_MS)).toBe(1);
  });
});

describe('names, on English content', () => {
  /**
   * The bug this guards: the run length was calibrated in characters for
   * Chinese, where two characters are a word. Two English letters are not, and
   * "an" matched almost any sentence — so items lit up at the wrong moment,
   * silently and only on English books.
   */
  test('a two-letter overlap is not a mention', () => {
    expect(names('The argument is about incentives.', 'Anchoring')).toBe(false);
    expect(names('This changes nothing at all.', 'Change management')).toBe(false);
  });

  test('a real mention still counts', () => {
    expect(names('Anchoring explains the whole result.', 'Anchoring')).toBe(true);
    expect(names('It is driven by the goal, not the plan.', 'Goal driven')).toBe(true);
  });

  test('Chinese is unchanged: two characters are still meant', () => {
    expect(names('这一节讲的是目标。', '目标导向')).toBe(true);
  });
});

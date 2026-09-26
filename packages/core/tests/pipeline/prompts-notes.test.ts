import { describe, expect, test } from 'bun:test';
import { en } from '../../src/pipeline/prompts/en';
import { promptsFor } from '../../src/pipeline/prompts';
import { zh } from '../../src/pipeline/prompts/zh';

describe('promptsFor notes', () => {
  test('a book gets the prompts exactly as written', () => {
    expect(promptsFor('en')).toBe(en);
    expect(promptsFor('zh', 'book')).toBe(zh);
  });

  test('every system prompt of a notes path is told whose words these are', () => {
    for (const locale of ['en', 'zh'] as const) {
      const p = promptsFor(locale, 'notes');
      const systems = [
        p.map.system, p.classify.system, p.reduce.system('knowledge', 'x'), p.slides.system, p.recap.system,
      ];
      for (const system of systems) expect(system).toContain(locale === 'en' ? 'own notes' : '自己写的笔记');
    }
  });

  test('the preamble sits inside the instructions, escaped like the rest', () => {
    const system = promptsFor('en', 'notes').map.system;
    expect(system.startsWith('<system_prompt><instructions>')).toBe(true);
    expect(system).not.toContain('"book"');
  });

  test('the recap station, which the reader sees, no longer speaks of a book', () => {
    expect(promptsFor('zh', 'notes').recap.stageTitle).not.toContain('书');
    expect(promptsFor('en', 'notes').recap.brief).not.toContain('book');
  });
});

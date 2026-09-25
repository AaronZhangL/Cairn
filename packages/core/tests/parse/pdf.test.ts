import { describe, expect, test } from 'bun:test';
import { ParseError } from '../../src/types';
import { parsePdf } from '../../src/parse/pdf';
import { parseBook } from '../../src/parse';
import { makePdf } from './pdf-fixture';

/** Enough prose per page that a chapter clears chunk.ts's MIN_WORDS. */
function prose(tag: string): string[] {
  return Array.from({ length: 20 }, (_, i) => `${tag} sentence ${i} carries ten plain words of body text.`);
}

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof ParseError ? e.code : 'not a ParseError';
  }
}

describe('parsePdf', () => {
  test('chapters follow the outline, and running heads are gone', async () => {
    const pages = [
      ['THE BOOK', ...prose('Alpha'), '1'],
      ['THE BOOK', ...prose('Beta'), '2'],
      ['THE BOOK', ...prose('Gamma'), '3'],
    ];
    const bytes = makePdf({
      title: 'Anchors',
      author: 'A. Writer',
      pages,
      outline: [{ title: 'Chapter One', page: 0 }, { title: 'Chapter Two', page: 2 }],
    });
    const book = await parsePdf(bytes, 'anchors.pdf');

    expect(book.format).toBe('pdf');
    expect(book.title).toBe('Anchors');
    expect(book.author).toBe('A. Writer');
    expect(book.language).toBe('en');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two']);
    expect(book.chapters[0]!.text).toContain('Beta sentence 19');
    expect(book.chapters.some((c) => c.text.includes('THE BOOK'))).toBe(false);
  });

  test('without an outline, headings in the text split it', async () => {
    const bytes = makePdf({
      pages: [['Chapter 1 Start', '', ...prose('Alpha')], ['Chapter 2 End', '', ...prose('Beta')]],
    });
    const book = await parsePdf(bytes, 'plain.pdf');
    expect(book.title).toBe('plain');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1 Start', 'Chapter 2 End']);
  });

  test('a PDF with no text layer is named as scanned', async () => {
    expect(await codeOf(parsePdf(makePdf({ pages: [[], [], []] }), 'scan.pdf'))).toBe('scanned_pdf');
  });

  test('bytes that are not a PDF', async () => {
    expect(await codeOf(parsePdf(new TextEncoder().encode('not a pdf'), 'x.pdf'))).toBe('unreadable_pdf');
  });

  test('parseBook dispatches .pdf', async () => {
    const book = await parseBook(makePdf({ pages: [prose('Alpha')] }), 'x.PDF');
    expect(book.format).toBe('pdf');
  });
});

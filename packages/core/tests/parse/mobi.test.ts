import { describe, expect, test } from 'bun:test';
import { ParseError } from '../../src/types';
import { parseBook } from '../../src/parse';
import { parseMobi } from '../../src/parse/mobi';
import { decompressPalmDoc, stripTrailing } from '../../src/parse/mobi-decode';
import { makeMobi } from './mobi-fixture';

const prose = (tag: string): string =>
  Array.from({ length: 30 }, (_, i) => `<p>${tag} sentence ${i} carries ten plain words of body text.</p>`).join('');

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
    return undefined;
  } catch (e) {
    return e instanceof ParseError ? e.code : 'not a ParseError';
  }
}

describe('decompressPalmDoc', () => {
  test('literals, a counted copy, a back-reference and a space pair', () => {
    // "ab" literal · copy 3 bytes "cde" · back-reference distance 5 length 3 ("abc") · space + "x"
    const pair = 0x8000 | (5 << 3) | (3 - 3);
    const data = new Uint8Array([0x61, 0x62, 3, 0x63, 0x64, 0x65, pair >> 8, pair & 0xff, 0x78 ^ 0x80]);
    expect(new TextDecoder().decode(decompressPalmDoc(data))).toBe('abcdeabc x');
  });
});

describe('stripTrailing', () => {
  test('drops a sized trailing entry, then the multibyte overlap', () => {
    // body "hi" · 1 multibyte byte + its count (0b01 → 2 bytes) · a 2-byte entry whose size byte says 2
    const data = new Uint8Array([0x68, 0x69, 0xaa, 0x01, 0x00, 0x82]);
    expect([...stripTrailing(data, 0b11)]).toEqual([0x68, 0x69]);
  });
});

describe('parseMobi', () => {
  test('chapters split at page breaks and named by their headings', () => {
    const html = `<html><body><h2>Chapter One</h2>${prose('Alpha')}<mbp:pagebreak/><h2>Chapter Two</h2>${prose('Beta')}</body></html>`;
    const book = parseMobi(makeMobi({ html, title: 'Anchors', author: 'A. Writer', language: 'en', recordSize: 500 }), 'a.mobi');
    expect(book.format).toBe('mobi');
    expect(book.title).toBe('Anchors');
    expect(book.author).toBe('A. Writer');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter One', 'Chapter Two']);
    expect(book.chapters[1]!.text).toContain('Beta sentence 29');
  });

  test('a combined file is read from its KF8 half, without the stylesheet flow', () => {
    const kf8 = `<?xml version="1.0"?><html><head><title>x</title></head><body><h1>New One</h1>${prose('Gamma')}</body></html>`;
    const book = parseMobi(
      makeMobi({ html: `<html><body>${prose('Old')}</body></html>`, kf8: { html: kf8, css: 'p { margin: 0 }' } }),
      'combo.azw3',
    );
    expect(book.chapters.map((c) => c.title)).toEqual(['New One']);
    expect(book.chapters[0]!.text).not.toContain('margin');
    expect(book.chapters[0]!.text).not.toContain('Old sentence');
  });

  test('untitled sections are named in the book’s language', () => {
    const html = `<p>${'锚定效应说的是人们会过度依赖最先得到的信息。'.repeat(30)}</p><mbp:pagebreak/><p>${'第二部分继续讨论。'.repeat(40)}</p>`;
    const book = parseMobi(makeMobi({ html }), '书.mobi');
    expect(book.language).toBe('zh');
    expect(book.chapters.every((c) => c.title.length > 0 && !c.title.startsWith('（'))).toBe(true);
  });

  test('DRM is named, not reported as damage', () => {
    expect(codeOf(() => parseMobi(makeMobi({ html: prose('A'), encryption: 2 }), 'a.azw'))).toBe('drm_protected');
  });

  test('bytes that are not a Kindle book', () => {
    expect(codeOf(() => parseMobi(new TextEncoder().encode('x'.repeat(200)), 'a.mobi'))).toBe('corrupt_archive');
  });

  test('a truncated file is refused rather than read as half a book', () => {
    const bytes = makeMobi({ html: prose('A'), recordSize: 300 });
    expect(codeOf(() => parseMobi(bytes.subarray(0, bytes.byteLength - 700), 'a.mobi'))).toBe('corrupt_archive');
  });

  test('parseBook dispatches .azw3', async () => {
    expect((await parseBook(makeMobi({ html: prose('A') }), 'a.AZW3')).format).toBe('mobi');
  });
});

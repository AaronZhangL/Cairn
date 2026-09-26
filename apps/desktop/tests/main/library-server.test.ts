import { describe, expect, test } from 'bun:test';
import { parseRange, previewFile, resolveInLibrary } from '../../src/main/library-server';
import { VOICES } from '../../src/shared/settings';

const ROOT = '/tmp/lib';
const TOKEN = 'tok';

describe('resolveInLibrary', () => {
  test('resolves a book file under the root', () => {
    expect(resolveInLibrary(ROOT, `/${TOKEN}/books/a/path.json`, TOKEN))
      .toBe('/tmp/lib/books/a/path.json');
  });

  test('serves a cover beside the book, and nothing else by that name', () => {
    expect(resolveInLibrary(ROOT, `/${TOKEN}/books/a/cover.jpg`, TOKEN)).toBe('/tmp/lib/books/a/cover.jpg');
    expect(resolveInLibrary(ROOT, `/${TOKEN}/books/a/weread.json`, TOKEN)).toBeUndefined();
    expect(resolveInLibrary(ROOT, `/${TOKEN}/books/a/cover.svg`, TOKEN)).toBeUndefined();
  });

  test('rejects a wrong or missing token', () => {
    expect(resolveInLibrary(ROOT, '/other/books.json', TOKEN)).toBeUndefined();
    expect(resolveInLibrary(ROOT, '/books.json', TOKEN)).toBeUndefined();
    expect(resolveInLibrary(ROOT, `/${TOKEN}`, TOKEN)).toBeUndefined();
  });

  test('rejects traversal, plain and encoded', () => {
    expect(resolveInLibrary(ROOT, `/${TOKEN}/../../etc/passwd`, TOKEN)).toBeUndefined();
    expect(resolveInLibrary(ROOT, `/${TOKEN}/%2e%2e/%2e%2e/etc/passwd`, TOKEN)).toBeUndefined();
    // A decoded separator must not smuggle a segment past the check
    expect(resolveInLibrary(ROOT, `/${TOKEN}/%2e%2e%2fetc/passwd`, TOKEN)).toBeUndefined();
  });

  test('a sibling directory sharing the prefix is not inside the root', () => {
    expect(resolveInLibrary('/tmp/lib', `/${TOKEN}/%2e%2e/lib-other/x`, TOKEN)).toBeUndefined();
  });

  test('a malformed escape misses rather than throwing', () => {
    expect(() => resolveInLibrary(ROOT, `/${TOKEN}/%zz`, TOKEN)).not.toThrow();
  });

  test('does not serve settings, source chapters, chat, or reading state to the webview', () => {
    for (const path of ['settings.json', 'books/a/chapters.json', 'books/a/notes.json', 'books/a/chat.json', 'books/a/reading.json']) {
      expect(resolveInLibrary(ROOT, `/${TOKEN}/${path}`, TOKEN)).toBeUndefined();
    }
    expect(resolveInLibrary(ROOT, `/${TOKEN}/books.json`, TOKEN)).toBe('/tmp/lib/books.json');
    expect(resolveInLibrary(ROOT, `/${TOKEN}/books/a/decks/n0.json`, TOKEN)).toBe('/tmp/lib/books/a/decks/n0.json');
  });
});

describe('voice previews', () => {
  test('every voice the panel offers can be auditioned over the server', () => {
    // The file used to be written under the voice's name and allowed under the
    // language's, so every preview 404'd.
    for (const voice of [...VOICES.en, ...VOICES.zh]) {
      expect(resolveInLibrary(ROOT, `/${TOKEN}/${previewFile(voice.id)}`, TOKEN)).toBeDefined();
    }
  });

  test('a preview name cannot carry a path', () => {
    expect(resolveInLibrary(ROOT, `/${TOKEN}/.preview/..%2Fsettings.json`, TOKEN)).toBeUndefined();
    expect(resolveInLibrary(ROOT, `/${TOKEN}/.preview/settings.json`, TOKEN)).toBeUndefined();
  });
});

describe('parseRange', () => {
  test('bytes=a-b', () => {
    expect(parseRange('bytes=10-20', 100)).toEqual([10, 20]);
  });

  test('open-ended range runs to the last byte', () => {
    expect(parseRange('bytes=10-', 100)).toEqual([10, 99]);
  });

  test('suffix range counts back from the end', () => {
    expect(parseRange('bytes=-10', 100)).toEqual([90, 99]);
  });

  test('clamps past the end instead of reading out of bounds', () => {
    expect(parseRange('bytes=90-500', 100)).toEqual([90, 99]);
    expect(parseRange('bytes=500-600', 100)).toEqual([99, 99]);
  });

  test('no header, junk, or an empty file means whole-file', () => {
    expect(parseRange(null, 100)).toBeUndefined();
    expect(parseRange('bytes=abc', 100)).toBeUndefined();
    expect(parseRange('bytes=-', 100)).toBeUndefined();
    expect(parseRange('bytes=0-10', 0)).toBeUndefined();
  });
});

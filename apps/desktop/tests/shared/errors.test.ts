import { describe, expect, test } from 'bun:test';
import { CairnError } from '@cairn/core/errors';
import { ParseError } from '@cairn/core/types';
import { decodeError, encodeError, encodingErrors } from '../../src/shared/errors';

describe('encode then decode', () => {
  test('a code survives the trip', () => {
    const payload = decodeError(encodeError(new CairnError('tts_missing')).message);
    expect(payload.code).toBe('tts_missing');
  });

  test('so do its values', () => {
    const encoded = encodeError(new CairnError('unknown_node', { id: 'n3' }));
    expect(decodeError(encoded.message).params).toEqual({ id: 'n3' });
  });

  test('and its untranslated tail', () => {
    const encoded = encodeError(new CairnError('tts_failed', {}, 'exit 1'));
    expect(decodeError(encoded.message).detail).toBe('exit 1');
  });

  /**
   * `ParseError` predates this module and carries its own code. It is mapped
   * rather than rewritten, so this is the guard that the mapping stays wired.
   */
  test('a ParseError keeps the code it already had', () => {
    const cause = new ParseError('whatever', 'corrupt_archive', { ext: 'epub' });
    const payload = decodeError(encodeError(cause).message);
    expect(payload.code).toBe('corrupt_archive');
    expect(payload.params).toEqual({ ext: 'epub' });
  });

  test('an ordinary Error keeps its text where a human can still read it', () => {
    const payload = decodeError(encodeError(new Error('kaboom')).message);
    expect(payload.code).toBe('unknown');
    expect(payload.detail).toBe('kaboom');
  });

  test('the stack is kept for the terminal', () => {
    const cause = new CairnError('cancelled');
    expect(encodeError(cause).stack).toBe(cause.stack);
  });
});

describe('decodeError on messages that were never encoded', () => {
  /**
   * A shell built before this existed throws plain sentences. Showing one
   * verbatim is worse than nothing only if we mistake it for a code — so it
   * comes back as `unknown` with the text intact.
   */
  test('a plain sentence is carried as detail, not read as a code', () => {
    const payload = decodeError('找不到 edge-tts');
    expect(payload.code).toBe('unknown');
    expect(payload.detail).toBe('找不到 edge-tts');
  });

  test('an empty message means the bridge itself failed', () => {
    expect(decodeError('').code).toBe('main_silent');
  });

  test('a tagged but broken payload does not throw', () => {
    expect(decodeError('cairn-error:{not json').code).toBe('unknown');
  });

  test('a tagged payload with no code does not become one', () => {
    expect(decodeError('cairn-error:{"params":{}}').code).toBe('unknown');
  });
});

describe('encodingErrors', () => {
  test('wraps a throw without touching the value on success', async () => {
    const wrapped = encodingErrors({
      ok: async () => 'fine',
      bad: async () => { throw new CairnError('book_not_listed', { id: 'b1' }); },
    });

    expect(await wrapped.ok()).toBe('fine');
    // Every handler, not just the ones someone remembered to wrap by hand
    const cause = await wrapped.bad().catch((e: unknown) => e);
    expect(decodeError((cause as Error).message).code).toBe('book_not_listed');
  });
});

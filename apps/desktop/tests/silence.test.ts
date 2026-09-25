import { expect, test } from 'bun:test';
import { silentWav } from '../src/silence';

test('the unlock clip is a well-formed, silent 8-bit PCM WAV', () => {
  const uri = silentWav();
  expect(uri.startsWith('data:audio/wav;base64,')).toBe(true);
  const bytes = Uint8Array.from(atob(uri.split(',')[1]!), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  const text = (at: number, n: number): string => String.fromCharCode(...bytes.slice(at, at + n));

  expect(text(0, 4)).toBe('RIFF');
  expect(view.getUint32(4, true)).toBe(bytes.length - 8);
  expect(text(8, 8)).toBe('WAVEfmt ');
  expect(view.getUint16(20, true)).toBe(1);
  expect(text(36, 4)).toBe('data');
  expect(view.getUint32(40, true)).toBe(bytes.length - 44);
  expect(bytes.slice(44).every((b) => b === 128)).toBe(true);
});

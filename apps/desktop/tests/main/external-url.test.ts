import { describe, expect, test } from 'bun:test';
import { webUrl } from '../../src/main/external-url';

describe('webUrl', () => {
  test.each(['http://example.com/path', 'https://platform.openai.com/api-keys'])('allows %s', (value) => {
    expect(webUrl(value)).toBe(value);
  });

  test.each([
    'not a URL',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'custom-app://open/secret',
    '//example.com/path',
  ])('rejects %s', (value) => {
    expect(webUrl(value)).toBeUndefined();
  });
});

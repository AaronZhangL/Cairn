import { expect, test } from 'bun:test';
import { escapeXml } from '../../src/companion/xml';

test('dynamic text cannot close a model-facing XML section', () => {
  expect(escapeXml(`A & B <chapter>"' </chapter>`))
    .toBe('A &amp; B &lt;chapter&gt;&quot;&apos; &lt;/chapter&gt;');
});

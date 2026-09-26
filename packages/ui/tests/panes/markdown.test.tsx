import { expect, test } from 'bun:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Markdown, markCitations, parseBlocks, parseInline } from '../../src/panes/markdown';

test('splits a reply into paragraphs and lists instead of one run of text', () => {
  const blocks = parseBlocks('What makes it distinctive:\n- **Distributed**: every clone\n- **Snapshots**\n\nFiles live in three states.');
  expect(blocks).toEqual([
    { kind: 'p', text: 'What makes it distinctive:' },
    { kind: 'ul', items: ['**Distributed**: every clone', '**Snapshots**'] },
    { kind: 'p', text: 'Files live in three states.' },
  ]);
});

test('reads bold, italic, code and links, and leaves snake_case and lone stars alone', () => {
  expect(parseInline('a **b** *c* `d` [e](https://x.org) f_g_h 2 * 3')).toEqual([
    { kind: 'text', text: 'a ' }, { kind: 'strong', text: 'b' }, { kind: 'text', text: ' ' },
    { kind: 'em', text: 'c' }, { kind: 'text', text: ' ' }, { kind: 'code', text: 'd' }, { kind: 'text', text: ' ' },
    { kind: 'link', text: 'e', href: 'https://x.org' }, { kind: 'text', text: ' f_g_h 2 * 3' },
  ]);
});

test('does not turn a non-http link into an anchor', () => {
  expect(parseInline('[x](javascript:alert(1))')).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }]);
});

test('places each citation chip at its cited offset, through the markup', () => {
  const text = 'A **claim**. And web.';
  const marked = markCitations(text, [21, 12]);
  const html = renderToStaticMarkup(createElement(Markdown, {
    text: marked, renderMark: (index: number) => createElement('i', null, `c${index}`),
  }));
  expect(html).toBe('<div class="md"><p>A <strong>claim</strong>.<i>c1</i> And web.<i>c0</i></p></div>');
});

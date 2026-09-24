/** Text utilities: word counting for mixed CJK/Latin, decoding, and normalization. */

const CJK = /[㐀-䶿一-鿿豈-﫿぀-ヿ]/gu;
const LATIN_WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu;

/** CJK counts per character, Latin per word. The sum is the "word count". */
export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.match(LATIN_WORD)?.length ?? 0;
  return cjk + latin;
}

/** Collapse whitespace, normalize newlines, strip zero-width chars — but keep paragraph breaks. */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[ \t　]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Chinese TXT files are often GBK, which strict UTF-8 decoding rejects.
 * Try UTF-8 fatal first, fall back to GBK, then to lenient UTF-8.
 */
export function decodeBytes(bytes: Uint8Array): string {
  for (const encoding of ['utf-8', 'gbk'] as const) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      continue;
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

/**
 * Extract plain text from an XHTML fragment. Block tags become newlines so
 * paragraphs don't run together.
 *
 * Comments go first, and not because they are noise. A Word-exported EPUB keeps
 * its document properties in a conditional comment — `<!--[if gte mso 9]><xml>
 * <o:Author>…` — whose contents hold `>`, so the catch-all tag pattern below
 * cannot swallow it and the chapter opens with the author's initials and a save
 * timestamp. The head is dropped for the same reason: nothing in it is prose.
 */
export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*head[^>]*>[\s\S]*?<\/\s*head\s*>/gi, '')
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|li|tr|section|article|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return normalizeText(decodeEntities(withBreaks));
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

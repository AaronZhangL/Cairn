import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { ParseError } from '../../src/types';
import { parseBook } from '../../src/parse';
import { parseDocx } from '../../src/parse/docx';

const body = (tag: string): string =>
  Array.from({ length: 30 }, (_, i) => `${tag} sentence ${i} carries ten plain words of body text.`).join(' ');

const para = (text: string, style?: string): string =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** The smallest package Word itself would open: content types, relationships, body, styles. */
async function docx(paragraphs: string, styles = '', core = ''): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      `<Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file('word/document.xml', `<w:document ${W}><w:body>${paragraphs}</w:body></w:document>`);
  zip.file('word/styles.xml', `<w:styles ${W}>${styles}</w:styles>`);
  if (core) {
    zip.file(
      'docProps/core.xml',
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        `xmlns:dc="http://purl.org/dc/elements/1.1/">${core}</cp:coreProperties>`,
    );
  }
  return zip.generateAsync({ type: 'uint8array' });
}

const style = (id: string, name: string, extra = ''): string =>
  `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>${extra}</w:style>`;

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e instanceof ParseError ? e.code : 'not a ParseError';
  }
}

describe('parseDocx', () => {
  test('heading-styled paragraphs open chapters; core properties give title and author', async () => {
    const bytes = await docx(
      para('One', 'Heading1') + para(body('Alpha')) + para('Two', 'Heading1') + para(body('Beta')),
      style('Heading1', 'heading 1'),
      '<dc:title>Anchors</dc:title><dc:creator>A. Writer</dc:creator>',
    );
    const book = await parseDocx(bytes, 'a.docx');
    expect(book.format).toBe('docx');
    expect([book.title, book.author]).toEqual(['Anchors', 'A. Writer']);
    expect(book.chapters.map((c) => c.title)).toEqual(['One', 'Two']);
    expect(book.chapters[0]!.text).toContain('Alpha sentence 0');
  });

  test('a localised Word names its heading style "1"; the style name is what counts', async () => {
    const bytes = await docx(para('第一章', '1') + para(body('甲')) + para('第二章', '1') + para(body('乙')), style('1', 'heading 1'));
    expect((await parseDocx(bytes, 'a.docx')).chapters.map((c) => c.title)).toEqual(['第一章', '第二章']);
  });

  test('subsections stay under their chapter', async () => {
    const styles = style('Heading1', 'heading 1') + style('Heading2', 'heading 2');
    const bytes = await docx(para('Part', 'Heading1') + para('Sub', 'Heading2') + para(body('A')), styles);
    expect((await parseDocx(bytes, 'a.docx')).chapters[0]!.title).toBe('Part · Sub');
  });

  test('without headings, the text is split the way a TXT is', async () => {
    const bytes = await docx(para('Chapter 1 Start') + para(body('A')) + para('Chapter 2 End') + para(body('B')));
    const book = await parseDocx(bytes, 'plain.docx');
    expect(book.title).toBe('plain');
    expect(book.chapters.map((c) => c.title)).toEqual(['Chapter 1 Start', 'Chapter 2 End']);
  });

  test('entities are decoded and tabs become spaces', async () => {
    const run = '<w:p><w:r><w:t>Fish &amp; chips</w:t><w:tab/><w:t>&#8220;x&#8221;</w:t></w:r></w:p>';
    const book = await parseDocx(await docx(run + para(body('A'))), 'a.docx');
    expect(book.chapters[0]!.text).toContain('Fish & chips “x”');
  });

  test('not a zip, and a zip with no document', async () => {
    expect(await codeOf(parseDocx(new TextEncoder().encode('nope'), 'a.docx'))).toBe('corrupt_archive');
    const empty = await new JSZip().generateAsync({ type: 'uint8array' });
    expect(await codeOf(parseDocx(empty, 'a.docx'))).toBe('corrupt_archive');
  });

  test('parseBook dispatches .docx', async () => {
    expect((await parseBook(await docx(para(body('A'))), 'a.DOCX')).format).toBe('docx');
  });
});

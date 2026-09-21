import { describe, expect, test } from 'bun:test';
import JSZip from 'jszip';
import { parseEpub } from '../../src/parse/epub';
import { ParseError } from '../../src/types';

/** 每块约 2000 字，贴近真实章节体量，且不会被 chunkBlocks 合并。 */
const body = (t: string): string => '<p>' + `${t}。`.repeat(2000) + '</p>';

/** 构造一个结构真实的最小 EPUB：container.xml → OPF → spine → XHTML。 */
async function buildEpub(opts: { opfDir?: string; omitContainer?: boolean } = {}): Promise<Uint8Array> {
  const dir = opts.opfDir ?? 'OEBPS/';
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');

  if (!opts.omitContainer) {
    zip.file(
      'META-INF/container.xml',
      `<?xml version="1.0"?><container><rootfiles>
       <rootfile full-path="${dir}content.opf" media-type="application/oebps-package+xml"/>
       </rootfiles></container>`,
    );
  }

  zip.file(
    `${dir}content.opf`,
    `<?xml version="1.0"?>
     <package><metadata>
       <dc:title>思考，快与慢</dc:title><dc:creator>丹尼尔&#183;卡尼曼</dc:creator>
     </metadata>
     <manifest>
       <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
       <item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>
       <item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/>
       <item id="css" href="style.css" media-type="text/css"/>
     </manifest>
     <spine>
       <itemref idref="cover" linear="no"/>
       <itemref idref="c2"/>
       <itemref idref="c1"/>
     </spine></package>`,
  );

  zip.file(`${dir}cover.xhtml`, `<html><body>${body('封面')}</body></html>`);
  zip.file(`${dir}text/c1.xhtml`, `<html><body><h1>系统一</h1>${body('甲')}</body></html>`);
  zip.file(`${dir}text/c2.xhtml`, `<html><body><h1>锚定效应</h1>${body('乙')}</body></html>`);
  zip.file(`${dir}style.css`, 'p{margin:0}');

  return zip.generateAsync({ type: 'uint8array' });
}

describe('parseEpub', () => {
  test('取出书名与作者，实体被解码', async () => {
    const book = await parseEpub(await buildEpub(), 'x.epub');
    expect(book.title).toBe('思考，快与慢');
    expect(book.author).toBe('丹尼尔·卡尼曼');
  });

  test('章节顺序取自 spine 而非 manifest', async () => {
    const book = await parseEpub(await buildEpub(), 'x.epub');
    expect(book.chapters.map((c) => c.title)).toEqual(['锚定效应', '系统一']);
  });

  test('linear="no" 的项被跳过', async () => {
    const book = await parseEpub(await buildEpub(), 'x.epub');
    expect(book.chapters.some((c) => c.text.includes('封面'))).toBe(false);
  });

  test('非正文资源不进章节', async () => {
    const book = await parseEpub(await buildEpub(), 'x.epub');
    expect(book.chapters).toHaveLength(2);
  });

  test('章节标题取自 h1', async () => {
    const book = await parseEpub(await buildEpub(), 'x.epub');
    expect(book.chapters[0]!.title).toBe('锚定效应');
  });

  test('正文为纯文本，不含标签', async () => {
    const book = await parseEpub(await buildEpub(), 'x.epub');
    expect(book.chapters[0]!.text).not.toContain('<');
  });

  test('OPF 位于根目录时相对路径仍解析正确', async () => {
    const book = await parseEpub(await buildEpub({ opfDir: '' }), 'x.epub');
    expect(book.chapters).toHaveLength(2);
  });

  test('缺少 container.xml 时回退搜索 .opf', async () => {
    const book = await parseEpub(await buildEpub({ omitContainer: true }), 'x.epub');
    expect(book.chapters).toHaveLength(2);
  });

  test('totalWords 等于各章之和', async () => {
    const book = await parseEpub(await buildEpub(), 'x.epub');
    expect(book.totalWords).toBe(book.chapters.reduce((s, c) => s + c.wordCount, 0));
  });

  test('非 zip 数据抛 corrupt_archive', async () => {
    const bad = new TextEncoder().encode('this is definitely not a zip file at all');
    expect(parseEpub(bad, 'x.epub')).rejects.toThrow(ParseError);
  });

  test('空文件抛 empty_file', async () => {
    expect(parseEpub(new Uint8Array(0), 'x.epub')).rejects.toThrow(ParseError);
  });
});

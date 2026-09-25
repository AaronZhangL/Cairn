/**
 * Writes a minimal text PDF: Helvetica, one content stream per page, and an
 * optional outline pointing at pages. Real books are not checked in as fixtures.
 */
export interface FixtureOptions {
  /** Each page is a list of lines; an empty string leaves a blank line (a paragraph gap). */
  readonly pages: readonly (readonly string[])[];
  readonly outline?: readonly { readonly title: string; readonly page: number }[];
  readonly title?: string;
  readonly author?: string;
}

export function makePdf(opts: FixtureOptions): Uint8Array {
  const objects: string[] = [];
  const add = (body: string): number => objects.push(body);

  const catalog = add('');
  const pages = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const pageIds = opts.pages.map((lines) => {
    const stream = contentStream(lines);
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    return add(
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`,
    );
  });
  objects[pages - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

  const outlines = opts.outline && opts.outline.length > 0 ? writeOutline(opts.outline, pageIds, objects) : null;
  objects[catalog - 1] =
    `<< /Type /Catalog /Pages ${pages} 0 R${outlines ? ` /Outlines ${outlines} 0 R` : ''} >>`;

  const info = add(
    `<< ${opts.title ? `/Title (${escape(opts.title)}) ` : ''}${opts.author ? `/Author (${escape(opts.author)})` : ''} >>`,
  );
  return serialize(objects, catalog, info);
}

function contentStream(lines: readonly string[]): string {
  const body = lines.map((l) => (l.length > 0 ? `(${escape(l)}) Tj T*` : 'T*')).join('\n');
  return `BT /F1 11 Tf 14 TL 72 740 Td\n${body}\nET`;
}

function writeOutline(
  entries: readonly { readonly title: string; readonly page: number }[],
  pageIds: readonly number[],
  objects: string[],
): number {
  const root = objects.push('');
  const ids = entries.map((_, i) => root + 1 + i);
  objects[root - 1] = `<< /Type /Outlines /First ${ids[0]} 0 R /Last ${ids[ids.length - 1]} 0 R /Count ${ids.length} >>`;
  entries.forEach((e, i) => {
    const prev = i > 0 ? ` /Prev ${ids[i - 1]} 0 R` : '';
    const next = i + 1 < ids.length ? ` /Next ${ids[i + 1]} 0 R` : '';
    objects.push(
      `<< /Title (${escape(e.title)}) /Parent ${root} 0 R${prev}${next} ` +
        `/Dest [${pageIds[e.page]} 0 R /XYZ 0 792 0] >>`,
    );
  });
  return root;
}

function serialize(objects: readonly string[], catalog: number, info: number): Uint8Array {
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

function escape(s: string): string {
  return s.replace(/[\\()]/g, (c) => `\\${c}`);
}

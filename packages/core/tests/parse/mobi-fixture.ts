/**
 * Writes a minimal PalmDB Kindle file: uncompressed text records, a MOBI header
 * and EXTH metadata. Real Kindle books are not checked in as fixtures.
 */
export interface MobiFixture {
  readonly html: string;
  readonly title?: string;
  readonly author?: string;
  readonly language?: string;
  readonly encryption?: number;
  /** Bytes of text per record; small values exercise the record split. */
  readonly recordSize?: number;
  /** A second, KF8 body after a boundary; `css` is appended as a second flow. */
  readonly kf8?: { readonly html: string; readonly css: string };
}

const HEADER_LENGTH = 0xe8;

export function makeMobi(opts: MobiFixture): Uint8Array {
  const enc = new TextEncoder();
  const records: Uint8Array[] = [];
  const text = split(enc.encode(opts.html), opts.recordSize ?? 4096);

  const boundary = opts.kf8 ? 1 + text.length : undefined;
  records.push(record0({ ...opts, textLength: enc.encode(opts.html).byteLength, textRecords: text.length, version: 6, boundary }));
  records.push(...text);

  if (opts.kf8) {
    const flow0 = enc.encode(opts.kf8.html);
    const all = new Uint8Array([...flow0, ...enc.encode(opts.kf8.css)]);
    const kfText = split(all, opts.recordSize ?? 4096);
    const fdstIndex = 1 + kfText.length;
    records.push(record0({ ...opts, textLength: all.byteLength, textRecords: kfText.length, version: 8, fdst: fdstIndex }));
    records.push(...kfText);
    records.push(fdst([[0, flow0.byteLength], [flow0.byteLength, all.byteLength]]));
  }
  return palmDb(records);
}

function record0(o: MobiFixture & {
  textLength: number; textRecords: number; version: number; boundary?: number; fdst?: number;
}): Uint8Array {
  const enc = new TextEncoder();
  const exth = exthBlock([
    ...(o.title ? [[503, enc.encode(o.title)] as const] : []),
    ...(o.author ? [[100, enc.encode(o.author)] as const] : []),
    ...(o.language ? [[524, enc.encode(o.language)] as const] : []),
    ...(o.boundary !== undefined ? [[121, u32(o.boundary)] as const] : []),
  ]);
  const fullName = enc.encode(o.title ?? 'Untitled');
  const head = new Uint8Array(16 + HEADER_LENGTH);
  const view = new DataView(head.buffer);
  view.setUint16(0, 1);
  view.setUint32(4, o.textLength);
  view.setUint16(8, o.textRecords);
  view.setUint16(10, 4096);
  view.setUint16(12, o.encryption ?? 0);
  head.set(enc.encode('MOBI'), 16);
  view.setUint32(20, HEADER_LENGTH);
  view.setUint32(28, 65001);
  view.setUint32(36, o.version);
  view.setUint32(84, head.byteLength + exth.byteLength);
  view.setUint32(88, fullName.byteLength);
  view.setUint32(128, 0x40);
  view.setUint32(192, o.fdst ?? 0xffffffff);
  return new Uint8Array([...head, ...exth, ...fullName]);
}

function exthBlock(entries: readonly (readonly [number, Uint8Array])[]): Uint8Array {
  const body = entries.flatMap(([type, data]) => [...u32(type), ...u32(data.byteLength + 8), ...data]);
  return new Uint8Array([...new TextEncoder().encode('EXTH'), ...u32(12 + body.length), ...u32(entries.length), ...body]);
}

function fdst(flows: readonly (readonly [number, number])[]): Uint8Array {
  const body = flows.flatMap(([a, b]) => [...u32(a), ...u32(b)]);
  return new Uint8Array([...new TextEncoder().encode('FDST'), ...u32(12), ...u32(flows.length), ...body]);
}

function palmDb(records: readonly Uint8Array[]): Uint8Array {
  const header = new Uint8Array(78 + records.length * 8 + 2);
  const view = new DataView(header.buffer);
  header.set(new TextEncoder().encode('BOOKMOBI'), 60);
  view.setUint16(76, records.length);
  let offset = header.byteLength;
  records.forEach((r, i) => {
    view.setUint32(78 + i * 8, offset);
    offset += r.byteLength;
  });
  return new Uint8Array([...header, ...records.flatMap((r) => [...r])]);
}

function split(bytes: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.byteLength; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

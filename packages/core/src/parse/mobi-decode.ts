/**
 * The byte layer of a Kindle book: PalmDB records, the MOBI header, and the two
 * text compressions (PalmDOC LZ77, HUFF/CDIC). Only what the text needs is read;
 * images, fonts and the index records are not. Ported from foliate-js's mobi.js (MIT).
 */

export interface MobiHeader {
  readonly compression: number;
  readonly textLength: number;
  readonly textRecords: number;
  readonly encryption: number;
  readonly encoding: 'utf-8' | 'windows-1252';
  readonly version: number;
  readonly title: Uint8Array;
  readonly huffRecord: number;
  readonly huffCount: number;
  readonly trailingFlags: number;
  /** Record of the flow table (KF8 only); flow 0 is the HTML, the rest CSS and SVG. */
  readonly fdst: number | undefined;
  readonly exth: ReadonlyMap<number, readonly Uint8Array[]>;
}

export const EXTH = { creator: 100, boundary: 121, title: 503, language: 524 } as const;
const NONE = 0xffffffff;

export class MobiFormatError extends Error {}

export function readRecords(bytes: Uint8Array): readonly Uint8Array[] {
  if (bytes.byteLength < 78) throw new MobiFormatError('shorter than a PalmDB header');
  const view = viewOf(bytes);
  const count = view.getUint16(76);
  const offsets = Array.from({ length: count }, (_, i) => view.getUint32(78 + i * 8));
  if (offsets.some((o, i) => i > 0 && o < offsets[i - 1]!)) throw new MobiFormatError('record offsets out of order');
  // A truncated file loses its trailing records as empty ones; `readText` refuses an empty text record.
  return offsets.map((start, i) => bytes.subarray(start, offsets[i + 1] ?? bytes.byteLength));
}

export function readHeader(record0: Uint8Array): MobiHeader {
  const view = viewOf(record0);
  if (record0.byteLength < 132 || ascii(record0, 16, 4) !== 'MOBI') throw new MobiFormatError('no MOBI header');
  const length = view.getUint32(20);
  const u32 = (at: number): number => (at + 4 <= 16 + length && at + 4 <= record0.byteLength ? view.getUint32(at) : 0);
  const titleOffset = u32(84);
  const version = u32(36);
  const fdst = version >= 8 ? u32(192) : NONE;
  return {
    compression: view.getUint16(0),
    textLength: view.getUint32(4),
    textRecords: view.getUint16(8),
    encryption: view.getUint16(12),
    encoding: u32(28) === 65001 ? 'utf-8' : 'windows-1252',
    version,
    title: record0.subarray(titleOffset, titleOffset + u32(88)),
    huffRecord: u32(112),
    huffCount: u32(116),
    // Older headers end before this field; reading past them yields another field's bytes.
    trailingFlags: length >= 0xe4 && record0.byteLength >= 244 ? view.getUint16(242) : 0,
    fdst: fdst === NONE || fdst === 0 ? undefined : fdst,
    exth: u32(128) & 0x40 ? readExth(record0.subarray(16 + length)) : new Map(),
  };
}

function readExth(buf: Uint8Array): ReadonlyMap<number, readonly Uint8Array[]> {
  const entries = new Map<number, Uint8Array[]>();
  if (buf.byteLength < 12 || ascii(buf, 0, 4) !== 'EXTH') return entries;
  const view = viewOf(buf);
  let offset = 12;
  for (let i = 0; i < view.getUint32(8) && offset + 8 <= buf.byteLength; i += 1) {
    const type = view.getUint32(offset);
    const size = view.getUint32(offset + 4);
    if (size < 8) break;
    entries.set(type, [...(entries.get(type) ?? []), buf.subarray(offset + 8, offset + size)]);
    offset += size;
  }
  return entries;
}

export function exthUint(header: MobiHeader, type: number): number | undefined {
  const value = header.exth.get(type)?.[0];
  return value && value.byteLength === 4 ? viewOf(value).getUint32(0) : undefined;
}

/**
 * The book's HTML, decompressed. `start` is the record holding the header, which
 * is not 0 for the KF8 half of a combined MOBI/KF8 file.
 */
export function readText(records: readonly Uint8Array[], start: number, header: MobiHeader): Uint8Array {
  const record = (i: number): Uint8Array => {
    const r = records[start + i];
    if (!r || r.byteLength === 0) throw new MobiFormatError(`record ${start + i} missing`);
    return r;
  };
  const decompress = decompressorFor(header, record);
  const parts = Array.from({ length: header.textRecords }, (_, i) =>
    decompress(stripTrailing(record(i + 1), header.trailingFlags)),
  );
  const text = concat(parts).subarray(0, header.textLength);
  return header.fdst === undefined ? text : text.subarray(0, firstFlowEnd(record(header.fdst)) ?? text.byteLength);
}

function decompressorFor(header: MobiHeader, record: (i: number) => Uint8Array): (data: Uint8Array) => Uint8Array {
  if (header.compression === 1) return (data) => data;
  if (header.compression === 2) return decompressPalmDoc;
  if (header.compression === 17480) {
    const cdics = Array.from({ length: header.huffCount - 1 }, (_, i) => record(header.huffRecord + 1 + i));
    return huffDecompressor(record(header.huffRecord), cdics);
  }
  throw new MobiFormatError(`unknown compression ${header.compression}`);
}

function firstFlowEnd(fdst: Uint8Array): number | undefined {
  if (fdst.byteLength < 20 || ascii(fdst, 0, 4) !== 'FDST') return undefined;
  return viewOf(fdst).getUint32(16);
}

/** Each set bit above the lowest marks a variable-length entry appended to the record; the lowest, multibyte overlap. */
export function stripTrailing(data: Uint8Array, flags: number): Uint8Array {
  let out = data;
  for (let bits = flags >>> 1; bits > 0; bits >>>= 1) {
    if (bits & 1) out = out.subarray(0, Math.max(0, out.byteLength - varLenFromEnd(out)));
  }
  if (flags & 1 && out.byteLength > 0) out = out.subarray(0, out.byteLength - ((out[out.byteLength - 1]! & 0b11) + 1));
  return out;
}

function varLenFromEnd(data: Uint8Array): number {
  let value = 0;
  for (const byte of data.subarray(-4)) {
    if (byte & 0x80) value = 0;
    value = (value << 7) | (byte & 0x7f);
  }
  return value;
}

export function decompressPalmDoc(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; i += 1) {
    const byte = data[i]!;
    if (byte === 0 || (byte >= 9 && byte <= 0x7f)) {
      out.push(byte);
    } else if (byte <= 8) {
      for (const b of data.subarray(i + 1, i + 1 + byte)) out.push(b);
      i += byte;
    } else if (byte <= 0xbf) {
      const pair = (byte << 8) | (data[i + 1] ?? 0);
      i += 1;
      const distance = (pair & 0x3fff) >>> 3;
      const length = (pair & 0b111) + 3;
      for (let j = 0; j < length; j += 1) out.push(out[out.length - distance] ?? 0);
    } else {
      out.push(0x20, byte ^ 0x80);
    }
  }
  return Uint8Array.from(out);
}

export function huffDecompressor(huff: Uint8Array, cdics: readonly Uint8Array[]): (data: Uint8Array) => Uint8Array {
  if (huff.byteLength < 16 || ascii(huff, 0, 4) !== 'HUFF') throw new MobiFormatError('no HUFF record');
  const view = viewOf(huff);
  const offset1 = view.getUint32(8);
  const offset2 = view.getUint32(12);
  const table1 = Array.from({ length: 256 }, (_, i) => view.getUint32(offset1 + i * 4));
  const minCode = [0, ...Array.from({ length: 32 }, (_, i) => view.getUint32(offset2 + i * 8))];
  const maxCode = [0, ...Array.from({ length: 32 }, (_, i) => view.getUint32(offset2 + i * 8 + 4))];
  const dictionary = readDictionary(cdics);

  const decompress = (data: Uint8Array): Uint8Array => {
    const parts: Uint8Array[] = [];
    const bitLength = data.byteLength * 8;
    for (let pos = 0; pos < bitLength; ) {
      const bits = read32Bits(data, pos);
      const entry = table1[bits >>> 24]!;
      let codeLength = entry & 0x1f;
      let max = entry >>> 8;
      if (!(entry & 0x80)) {
        while (codeLength < 32 && bits >>> (32 - codeLength) < minCode[codeLength]!) codeLength += 1;
        max = maxCode[codeLength]!;
      }
      pos += codeLength;
      if (pos > bitLength) break;
      const code = max - (bits >>> (32 - codeLength));
      const word = dictionary[code];
      if (!word) throw new MobiFormatError(`HUFF code ${code} outside the dictionary`);
      if (!word.done) dictionary[code] = { data: decompress(word.data), done: true };
      parts.push(dictionary[code]!.data);
    }
    return concat(parts);
  };
  return decompress;
}

function readDictionary(cdics: readonly Uint8Array[]): { data: Uint8Array; done: boolean }[] {
  const words: { data: Uint8Array; done: boolean }[] = [];
  for (const cdic of cdics) {
    if (cdic.byteLength < 16 || ascii(cdic, 0, 4) !== 'CDIC') throw new MobiFormatError('no CDIC record');
    const view = viewOf(cdic);
    const headerLength = view.getUint32(4);
    const total = view.getUint32(8);
    const n = Math.min(1 << view.getUint32(12), total - words.length);
    const body = cdic.subarray(headerLength);
    const bodyView = viewOf(body);
    for (let i = 0; i < n; i += 1) {
      const at = bodyView.getUint16(i * 2);
      const tag = bodyView.getUint16(at);
      words.push({ data: body.subarray(at + 2, at + 2 + (tag & 0x7fff)), done: (tag & 0x8000) !== 0 });
    }
  }
  return words;
}

/** Thirty-two bits starting at any bit offset, big-endian; past the end reads as zeros. */
function read32Bits(data: Uint8Array, pos: number): number {
  const i = pos >>> 3;
  const hi = (((data[i] ?? 0) << 24) | ((data[i + 1] ?? 0) << 16) | ((data[i + 2] ?? 0) << 8) | (data[i + 3] ?? 0)) >>> 0;
  const shift = pos & 7;
  return shift === 0 ? hi : ((hi << shift) | ((data[i + 4] ?? 0) >>> (8 - shift))) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

function viewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

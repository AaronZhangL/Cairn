/**
 * Reading a comparable magnitude out of a slide's value string.
 *
 * Values are written for a human ("3.5 万", "68%"), so comparing them means
 * parsing both the scale word and the unit. Comparability is all or nothing:
 * one unreadable value, or two different units, and the whole set is refused —
 * bars that compare unlike things are worse than no bars.
 */
const SCALES: readonly (readonly [string, number])[] = [
  ['亿', 1e8], ['万', 1e4], ['千', 1e3], ['百', 1e2],
  ['k', 1e3], ['K', 1e3], ['m', 1e6], ['M', 1e6], ['b', 1e9], ['B', 1e9],
];

const NUMBER = /-?\d+(?:[,，]\d{3})*(?:\.\d+)?/;

/** The leading quantity in a display string, or undefined if there is none. */
export function magnitude(value: string): number | undefined {
  const match = NUMBER.exec(value);
  if (!match) return undefined;

  const n = Number(match[0].replace(/[,，]/g, ''));
  if (!Number.isFinite(n)) return undefined;

  // Only a scale word directly after the digits multiplies: in "110 年 · 第 3 万
  // 次" the 万 belongs to a different quantity.
  const tail = value.slice(match.index + match[0].length).trimStart();
  const scale = SCALES.find(([word]) => tail.startsWith(word));
  return scale ? n * scale[1] : n;
}

/**
 * Where the unit ends. In "110 年 · 第 3 万 次" the unit is 年, not the whole
 * remainder — a value string often carries an aside after a separator.
 */
const UNIT_END = /[\s·、,，/|(（)）]/u;

/**
 * The unit the leading quantity is measured in: "" for a bare number, "%" for a
 * percentage, "华氏度" for a temperature. Undefined only when there is no
 * quantity to attach a unit to.
 *
 * A scale word is consumed rather than reported, because it is part of the
 * number: "3 万人" and "500 人" are the same unit at different scales, and
 * `magnitude` has already folded the scale into the value.
 */
export function unitOf(value: string): string | undefined {
  const match = NUMBER.exec(value);
  if (!match) return undefined;

  let tail = value.slice(match.index + match[0].length).trimStart();
  const scale = SCALES.find(([word]) => tail.startsWith(word));
  if (scale) tail = tail.slice(scale[0].length).trimStart();

  const end = tail.search(UNIT_END);
  return end === -1 ? tail : tail.slice(0, end);
}

/**
 * Bar widths as fractions of the largest value, or undefined when the set is
 * not comparable (any unreadable value, mixed units, or every value zero).
 *
 * Mixed units are refused for the same reason an unreadable value is: "1%"
 * beside "32华氏度" parses to 1 and 32, and the bars would assert a ratio
 * between a proportion and a temperature that the book never claimed. Two
 * numbers only compare when they measure the same kind of thing.
 */
export function magnitudes(values: readonly string[]): readonly number[] | undefined {
  const parsed = values.map(magnitude);
  if (parsed.some((n) => n === undefined)) return undefined;

  const units = new Set(values.map(unitOf));
  if (units.size > 1) return undefined;

  const nums = parsed as number[];
  if (nums.some((n) => n < 0)) return undefined;

  const max = Math.max(...nums);
  if (max <= 0) return undefined;

  return nums.map((n) => n / max);
}

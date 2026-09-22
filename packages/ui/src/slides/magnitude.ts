/**
 * Reading a comparable magnitude out of a `number` slide's value string.
 *
 * The values are display strings written for a human ("110 年", "1 枚", "3.5 万",
 * "68%"), not numbers, because that is what belongs on the slide. To draw them
 * as proportional bars they have to be comparable, and comparability is all or
 * nothing: if one value in the set cannot be read, the bars would silently
 * compare unlike things, which is worse than no bars at all. `magnitudes`
 * therefore returns undefined for the whole set rather than guessing.
 *
 * Chinese scale words are the reason this is not a plain parseFloat. "3 万"
 * next to "500" is 30000 against 500; read naively it is 3 against 500, and the
 * bar would say the opposite of the truth.
 */
const SCALES: readonly (readonly [string, number])[] = [
  ['亿', 1e8], ['万', 1e4], ['千', 1e3], ['百', 1e2],
  ['k', 1e3], ['K', 1e3], ['m', 1e6], ['M', 1e6], ['b', 1e9], ['B', 1e9],
];

/** The leading quantity in a display string, or undefined if there is none. */
export function magnitude(value: string): number | undefined {
  const match = /-?\d+(?:[,，]\d{3})*(?:\.\d+)?/.exec(value);
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
 * Bar widths as fractions of the largest value, or undefined when the set is
 * not comparable (any unreadable value, or every value zero).
 */
export function magnitudes(values: readonly string[]): readonly number[] | undefined {
  const parsed = values.map(magnitude);
  if (parsed.some((n) => n === undefined)) return undefined;

  const nums = parsed as number[];
  if (nums.some((n) => n < 0)) return undefined;

  const max = Math.max(...nums);
  if (max <= 0) return undefined;

  return nums.map((n) => n / max);
}

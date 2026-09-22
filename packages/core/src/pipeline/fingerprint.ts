/**
 * A stable content fingerprint, for cache keys that must change when the thing
 * they key changes.
 *
 * Pure and dependency-free on purpose: this decides whether an expensive result
 * is reused, so it has to be testable on its own and identical on every run.
 */

/**
 * Order-independent serialization: two objects with the same entries produce the
 * same string. Plain `JSON.stringify` keys on property order, which would make a
 * fingerprint change for no reason.
 */
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
}

/**
 * FNV-1a, run twice with different offsets and concatenated.
 *
 * 64 bits rather than 32: a collision here does not fail loudly, it serves the
 * wrong audio next to the right subtitles, which is exactly the bug this key
 * exists to prevent.
 */
export function fingerprint(value: unknown): string {
  const text = stable(value);
  let a = 0x811c9dc5;
  let b = 0x01000193;

  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }

  return hex(a) + hex(b);
}

const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, '0');

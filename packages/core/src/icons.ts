/**
 * The pictogram vocabulary a slide may name.
 *
 * Deliberately a closed list, and deliberately small. Two reasons:
 *
 *   1. It is a schema enum, so the model cannot name a glyph that does not
 *      exist. A missing icon would render as a hole in the slide, and there is
 *      no runtime recovery from that.
 *   2. Every name here has to be drawable as a few stroked paths. Illustration
 *      is out of scope (see PRD), so a name only earns its place if simple
 *      line art actually reads as the thing.
 *
 * Abstract ideas are absent on purpose. There is no honest glyph for
 * "compound interest" or "identity", and inventing one turns the deck into
 * clipart. A station about an abstract idea shows no icon, which is correct.
 *
 * The drawings live in packages/ui — core owns the vocabulary, the renderer
 * owns the ink. `Record<IconName, Glyph>` there makes the coverage exhaustive
 * at compile time.
 */
export const ICON_NAMES = [
  // people and the body
  'person', 'group', 'brain', 'eye', 'hand', 'heart',
  // reading and time
  'book', 'pen', 'clock', 'calendar',
  // access and direction
  'key', 'lock', 'flag', 'target', 'compass', 'route',
  // making and testing
  'lightbulb', 'gear', 'tool', 'flask', 'layers', 'link',
  // nature and growth
  'seedling', 'mountain', 'fire', 'drop',
  // value and judgement
  'coin', 'scale', 'shield', 'trophy', 'star',
  // verdicts
  'check', 'cross', 'warning',
  // movement
  'trend-up', 'trend-down', 'cycle',
  // concrete objects that recur in case studies
  'bicycle', 'building',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

const LOOKUP: ReadonlySet<string> = new Set(ICON_NAMES);

/** Narrows an arbitrary model-supplied string. Anything unknown becomes undefined. */
export function toIconName(value: unknown): IconName | undefined {
  return typeof value === 'string' && LOOKUP.has(value) ? (value as IconName) : undefined;
}

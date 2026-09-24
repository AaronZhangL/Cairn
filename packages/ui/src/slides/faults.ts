/**
 * What the gauntlet flags without being looked at: text past the slide's
 * content box, and text drawn over other text. Pure, so it runs on measured
 * rects in the page and on plain numbers in a test.
 */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export type Fault =
  | { readonly kind: 'outside'; readonly label: string }
  | { readonly kind: 'overlap'; readonly label: string; readonly other: string };

/** Layout rounds to fractions of a pixel; a fault is something a reader could see. */
const SLACK = 1;

export function faults(
  frame: Box,
  boxes: readonly { readonly label: string; readonly box: Box }[],
): readonly Fault[] {
  const outside: Fault[] = boxes
    .filter(({ box }) => (
      box.left < frame.left - SLACK || box.top < frame.top - SLACK
      || box.right > frame.right + SLACK || box.bottom > frame.bottom + SLACK
    ))
    .map(({ label }) => ({ kind: 'outside', label }));

  const overlap: Fault[] = boxes.flatMap((a, i) => boxes.slice(i + 1)
    .filter((b) => overlaps(a.box, b.box))
    .map((b) => ({ kind: 'overlap' as const, label: a.label, other: b.label })));

  return [...outside, ...overlap];
}

function overlaps(a: Box, b: Box): boolean {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return width > SLACK && height > SLACK;
}

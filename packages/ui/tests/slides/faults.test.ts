import { describe, expect, test } from 'bun:test';
import { type Box, faults } from '../../src/slides/faults';

const box = (left: number, top: number, right: number, bottom: number): Box =>
  ({ left, top, right, bottom });
const frame = box(0, 0, 100, 50);

describe('faults', () => {
  test('text inside the frame and apart from each other is clean', () => {
    expect(faults(frame, [
      { label: 'a', box: box(10, 10, 40, 20) },
      { label: 'b', box: box(50, 10, 90, 20) },
    ])).toEqual([]);
  });

  test('text past any edge of the frame is reported', () => {
    expect(faults(frame, [
      { label: 'low', box: box(10, 40, 40, 58) },
      { label: 'wide', box: box(80, 10, 104, 20) },
    ])).toEqual([
      { kind: 'outside', label: 'low' },
      { kind: 'outside', label: 'wide' },
    ]);
  });

  test('two pieces of text drawn over each other are reported once', () => {
    expect(faults(frame, [
      { label: 'a', box: box(10, 10, 40, 20) },
      { label: 'b', box: box(30, 15, 60, 25) },
    ])).toEqual([{ kind: 'overlap', label: 'a', other: 'b' }]);
  });

  test('boxes that only touch, or overlap by sub-pixel rounding, are not faults', () => {
    expect(faults(frame, [
      { label: 'a', box: box(10, 10, 40, 20) },
      { label: 'b', box: box(39.6, 10, 60, 20) },
      { label: 'c', box: box(10, 20, 40, 30) },
      { label: 'edge', box: box(0, 49.7, 20, 50.4) },
    ])).toEqual([]);
  });
});

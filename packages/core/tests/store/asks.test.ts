import { describe, expect, test } from 'bun:test';
import { type AskRecord, stationHeat } from '../../src/store/asks';

const ask = (nodeId: string, grounded = true): AskRecord =>
  ({ at: '2026-01-01T00:00:00.000Z', nodeId, question: 'q', grounded });

describe('stationHeat', () => {
  test('按站累计提问数', () => {
    const heat = stationHeat([ask('n0'), ask('n0'), ask('n1')]);
    expect(heat.get('n0')).toBe(2);
    expect(heat.get('n1')).toBe(1);
  });

  test('书里答不上来的问题算两次——那是更强的信号', () => {
    expect(stationHeat([ask('n0', false)]).get('n0')).toBe(2);
  });

  test('没提过问的站不出现', () => {
    expect(stationHeat([ask('n0')]).has('n9')).toBe(false);
  });
});

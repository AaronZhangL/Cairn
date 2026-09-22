import { describe, expect, test } from 'bun:test';
import { appendAsk, type AskRecord, hottestStations, stationHeat } from '../../src/store/asks';

const ask = (nodeId: string, grounded = true): AskRecord =>
  ({ at: '2026-01-01T00:00:00.000Z', nodeId, question: 'q', grounded });

describe('appendAsk', () => {
  test('不改动原数组', () => {
    const log = [ask('n0')];
    appendAsk(log, ask('n1'));
    expect(log).toHaveLength(1);
  });

  test('超出上限时丢掉最旧的', () => {
    let log: readonly AskRecord[] = [];
    for (let i = 0; i < 5; i += 1) log = appendAsk(log, ask(`n${i}`), 3);
    expect(log.map((r) => r.nodeId)).toEqual(['n2', 'n3', 'n4']);
  });
});

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

describe('hottestStations', () => {
  test('最该回头看的站排在前面', () => {
    const log = [ask('n0'), ask('n1'), ask('n1'), ask('n1')];
    expect(hottestStations(log)[0]).toEqual({ nodeId: 'n1', heat: 3 });
  });

  test('只问过一次的站不算热点', () => {
    expect(hottestStations([ask('n0')])).toEqual([]);
  });
});

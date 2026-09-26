import { describe, expect, test } from 'bun:test';
import { checkCoherence, checkCoverage, checkFaithfulness, comparePaths } from '../../src/eval/judge';
import { byLabel, notes, station } from './fixtures';

const path = { nodes: [station('n0', [0]), station('n1', [1])], stages: [{ title: '甲', nodeIds: ['n0', 'n1'] }] };
const other = { nodes: [station('n0', [2])], stages: [{ title: '乙', nodeIds: ['n0'] }] };
const verdict = (winner: string) => JSON.stringify({ winner, reason: '因为' });

describe('checkCoverage', () => {
  test('评审漏答的观点算作未覆盖', async () => {
    const provider = byLabel({ 'eval:coverage': JSON.stringify({ ideas: [{ index: 0, covered: true, station: 'n0' }] }) });
    const c = await checkCoverage(['一', '二'], path, provider);
    expect(c.share).toBe(0.5);
    expect(c.missing).toEqual(['二']);
  });
});

describe('checkFaithfulness', () => {
  test('按站点计忠实占比，忽略不存在的站点 id', async () => {
    const provider = byLabel({
      'eval:faithful': JSON.stringify({
        stations: [{ id: 'n0', unsupported: ['编的'] }, { id: 'n1', unsupported: [] }, { id: 'n9', unsupported: ['x'] }],
      }),
    });
    const f = await checkFaithfulness(notes, path, provider);
    expect(f.share).toBe(0.5);
    expect(f.unsupported).toEqual([{ station: 'n0', claim: '编的' }]);
  });
});

describe('checkCoherence', () => {
  test('评审没回答的模式不算通过', async () => {
    const provider = byLabel({ 'eval:coherence': JSON.stringify({ repeat: { pass: true, note: '' } }) });
    const c = await checkCoherence(notes, path, provider);
    expect(c.repeat.pass).toBe(true);
    expect(c.order.pass).toBe(false);
  });
});

describe('comparePaths', () => {
  test('交换顺序后仍选同一条才算赢', async () => {
    const provider = byLabel({ 'eval:pairwise.cb': verdict('A'), 'eval:pairwise.bc': verdict('B') });
    expect((await comparePaths(notes, '10 分钟', path, other, provider)).outcome).toBe('candidate');
  });

  test('两次都选第一个位置，是位置偏好，记平局', async () => {
    const provider = byLabel({ 'eval:pairwise.cb': verdict('A'), 'eval:pairwise.bc': verdict('A') });
    expect((await comparePaths(notes, '10 分钟', path, other, provider)).outcome).toBe('tie');
  });

  test('盲比只给评审看结构，不给简介：评审曾偏向字多的一边', async () => {
    const provider = byLabel({ 'eval:pairwise.cb': verdict('A'), 'eval:pairwise.bc': verdict('B') });
    await comparePaths(notes, '10 分钟', path, other, provider);
    const prompt = provider.seen[0]?.prompt ?? '';
    expect(prompt).toContain('站n0');
    expect(prompt).not.toContain('讲清n0');
  });

  test('两次都选基线就是输', async () => {
    const provider = byLabel({ 'eval:pairwise.cb': verdict('B'), 'eval:pairwise.bc': verdict('A') });
    expect((await comparePaths(notes, '10 分钟', path, other, provider)).outcome).toBe('baseline');
  });
});

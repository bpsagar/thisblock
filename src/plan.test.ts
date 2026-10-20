import { describe, expect, it } from 'vitest';
import { BLOCK_MS, blockIndex, blockStartMs, kindAt } from './loop';
import { cellFor, kindFor, makePlan, MAX_FOCUS, MIN_FOCUS } from './plan';

const MIN = 60_000;
const start = Date.UTC(2026, 9, 20);

/** walk your own schedule from joining until two shared sessions later */
function walk(t: number): { firstFocus: number; breaks: number[]; rejoined: boolean } {
  const plan = makePlan(t);
  let b = blockIndex(t);
  let focusEnd = 0;
  while (kindFor(plan, b) !== 'break') b++;
  focusEnd = blockStartMs(b);
  const breaks: number[] = [];
  let len = 0;
  while (kindFor(plan, b) === 'break') { len++; b++; }
  breaks.push(len);
  return { firstFocus: focusEnd - t, breaks, rejoined: plan !== null };
}

describe('joining at any moment', () => {
  it('always starts on focus with 20 to 50 minutes before the first break', () => {
    for (let t = start; t < start + 3 * 24 * 60 * MIN; t += 7 * MIN + 13_000) {
      const plan = makePlan(t);
      expect(kindFor(plan, blockIndex(t))).not.toBe('break');
      const { firstFocus, breaks } = walk(t);
      expect(firstFocus).toBeGreaterThanOrEqual(MIN_FOCUS);
      expect(firstFocus).toBeLessThanOrEqual(MAX_FOCUS);
      expect(breaks[0]).toBeGreaterThanOrEqual(1);
      expect(breaks[0]).toBeLessThanOrEqual(2);
    }
  });

  it('lands back on the shared schedule in focus, with at least 20 minutes before the shared break', () => {
    for (let t = start; t < start + 3 * 24 * 60 * MIN; t += 11 * MIN + 7_000) {
      const plan = makePlan(t);
      if (!plan) continue;
      expect(kindAt(plan.syncAt)).not.toBe('break');
      let b = plan.syncAt;
      while (kindAt(b) !== 'break') b++;
      const second = (b - plan.syncAt) * BLOCK_MS;
      const cleanStart = kindAt(plan.syncAt - 1) === 'break';
      if (!cleanStart) expect(second).toBeGreaterThanOrEqual(MIN_FOCUS);
    }
  });

  it('needs no plan early in a session', () => {
    // find a session start and join one minute in
    let b = blockIndex(start);
    while (!(kindAt(b - 1) === 'break' && kindAt(b) !== 'break')) b++;
    expect(makePlan(blockStartMs(b) + MIN)).toBeNull();
  });

  it('keeps upcoming focus hidden and shows your break once wrap up starts', () => {
    let t = start;
    let plan = makePlan(t);
    while (!plan) { t += 5 * MIN; plan = makePlan(t); }
    const now = blockStartMs(blockIndex(t));
    expect(cellFor(plan, t, blockIndex(now) + 1)).toBe('unknown');
    const wrap = blockStartMs(plan.breakAt - 1) + MIN;
    expect(cellFor(plan, wrap, plan.breakAt - 1)).toBe('final');
    expect(cellFor(plan, wrap, plan.breakAt)).toBe('break');
    expect(cellFor(plan, wrap, plan.syncAt)).toBe('unknown');
  });
});

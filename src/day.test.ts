import { describe, expect, it } from 'vitest';
import { BLOCK_MS, LIMITS, extend, fresh, kindAt, resizeEnd, resizeStart, type Block } from './day';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 21, 9, 3); // 9:03, so the day starts at 9:00
const seq = (...v: number[]): (() => number) => { let i = 0; return () => v[i++ % v.length]; };

// 9:00 focus 30m, 9:30 break 10m, 9:40 focus 40m, 10:20 break 5m, 10:25 focus 25m
const day = (): Block[] => {
  const s = Date.UTC(2026, 9, 21, 9, 0);
  const lens: [Block['type'], number][] = [['focus', 30], ['break', 10], ['focus', 40], ['break', 5], ['focus', 25]];
  let t = s;
  return lens.map(([type, m]) => { const b = { type, start: t, end: t + m * MIN }; t = b.end; return b; });
};

describe('day', () => {
  it('starts with focus on a 5 minute mark, and alternates focus and break end to end', () => {
    const blocks = extend(fresh(T0), T0 + 24 * 60 * MIN);
    expect(blocks[0]).toMatchObject({ type: 'focus', start: Date.UTC(2026, 9, 21, 9, 0) });
    blocks.forEach((b, i) => {
      expect(b.start % BLOCK_MS).toBe(0);
      expect(b.end - b.start).toBeGreaterThanOrEqual(LIMITS[b.type].min);
      expect(b.end - b.start).toBeLessThanOrEqual(LIMITS[b.type].max);
      if (i) { expect(b.start).toBe(blocks[i - 1].end); expect(b.type).not.toBe(blocks[i - 1].type); }
    });
  });

  it('calls the last 5 minutes of focus wrap up', () => {
    const b = day();
    expect(kindAt(b, b[0].start)).toBe('focus');
    expect(kindAt(b, b[0].end - 1)).toBe('final');
    expect(kindAt(b, b[1].start)).toBe('break');
  });

  it('moves everything after a block with its end', () => {
    const b = day();
    const { blocks } = resizeEnd(b, 2, b[2].end + 10 * MIN, T0);
    expect(blocks[2].end - blocks[2].start).toBe(50 * MIN);
    expect(blocks[3].start).toBe(blocks[2].end);
    expect(blocks[4].end).toBe(b[4].end + 10 * MIN);
    expect(blocks.slice(0, 2)).toEqual(b.slice(0, 2));
  });

  it('keeps focus between 15 minutes and an hour, and a break at least 5 minutes', () => {
    const b = day();
    expect(resizeEnd(b, 2, b[2].start + 90 * MIN, T0)).toMatchObject({ limit: 'max' });
    expect(resizeEnd(b, 2, b[2].start + 90 * MIN, T0).blocks[2].end).toBe(b[2].start + 60 * MIN);
    expect(resizeEnd(b, 2, b[2].start, T0).blocks[2].end).toBe(b[2].start + 15 * MIN);
    expect(resizeEnd(b, 3, b[3].start, T0)).toMatchObject({ limit: 'min' });
    expect(resizeEnd(b, 3, b[3].start + 3 * 60 * MIN, T0).blocks[3].end).toBe(b[3].start + 3 * 60 * MIN);
  });

  it('trades a focus start with the break before it', () => {
    const b = day();
    const { blocks } = resizeStart(b, 2, b[2].start - 5 * MIN, T0);
    expect(blocks[1].end).toBe(b[2].start - 5 * MIN);
    expect(blocks[2].start).toBe(b[2].start - 5 * MIN);
    expect(blocks[4]).toEqual(b[4]);
    // the break cannot go under 5 minutes
    expect(resizeStart(b, 2, b[1].start, T0).blocks[1].end).toBe(b[1].start + 5 * MIN);
  });

  it('never moves an edge into the past', () => {
    const b = day();
    const now = b[2].start + 22 * MIN; // 10:02, in the 40 minute focus
    expect(resizeEnd(b, 2, b[2].start, now).blocks[2].end).toBe(b[2].start + 25 * MIN);
    expect(resizeStart(b, 4, b[3].start - 60 * MIN, now).blocks[4].start).toBe(b[3].start + 5 * MIN);
  });

  it('keeps a name with its block when edges move', () => {
    const b = day();
    b[2] = { ...b[2], title: 'write the spec' };
    expect(resizeEnd(b, 0, b[0].end + 10 * MIN, T0).blocks[2]).toMatchObject({ title: 'write the spec', start: b[2].start + 10 * MIN });
    expect(resizeStart(b, 2, b[2].start - 5 * MIN, T0).blocks[2].title).toBe('write the spec');
  });

  it('makes the next blocks with the given randomness', () => {
    const blocks = extend(fresh(T0, seq(0)), T0 + 60 * MIN, seq(0.99));
    expect(blocks.map((b) => [b.type, (b.end - b.start) / MIN])).toEqual([['focus', 25], ['break', 10], ['focus', 50]]);
  });
});

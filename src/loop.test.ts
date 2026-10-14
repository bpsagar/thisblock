import { describe, expect, it } from 'vitest';
import { BLOCK_MS, blockIndex, cellAt, columns, kindAt, sessionIndex, stateAt } from './loop';

const T0 = Date.UTC(2026, 9, 14, 10, 0, 0);

describe('loop', () => {
  it('is deterministic', () => {
    const a = Array.from({ length: 300 }, (_, i) => kindAt(i));
    const b = Array.from({ length: 300 }, (_, i) => kindAt(i));
    expect(a).toEqual(b);
  });

  it('builds sessions of 5 to 10 focus blocks ending in one wrap up, then 1 or 2 breaks', () => {
    const kinds = Array.from({ length: 4000 }, (_, i) => kindAt(i));
    let i = 0;
    let sessions = 0;
    while (i < kinds.length - 20) {
      let n = 0;
      while (kinds[i] === 'focus') { n++; i++; }
      expect(kinds[i]).toBe('final');
      n++; i++;
      let b = 0;
      while (kinds[i] === 'break') { b++; i++; }
      expect(n).toBeGreaterThanOrEqual(5);
      expect(n).toBeLessThanOrEqual(10);
      expect(b).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(2);
      sessions++;
    }
    expect(sessions).toBeGreaterThan(100);
  });

  it('counts down inside a block', () => {
    const s = stateAt(blockIndex(T0) * BLOCK_MS + Date.UTC(2026, 0, 1) + 1000);
    expect(s.msLeft).toBe(BLOCK_MS - 1000);
  });

  it('never shows upcoming focus blocks, and shows breaks only after wrap up starts', () => {
    const base = Date.UTC(2026, 0, 1);
    for (let b = 1000; b < 1400; b++) {
      const now = base + b * BLOCK_MS + 1000;
      const kind = kindAt(b);
      for (let k = 1; k <= 12; k++) {
        const c = cellAt(now, b + k);
        expect(c === 'focus' || c === 'final').toBe(false);
        if (kind === 'focus') expect(c).toBe('unknown');
      }
      if (kind === 'final') expect(cellAt(now, b + 1)).toBe('break');
    }
  });

  it('marks the current column', () => {
    const now = Date.UTC(2026, 0, 1) + 1000 * BLOCK_MS + 1000;
    const cols = columns(now, 3, 6);
    expect(cols).toHaveLength(10);
    expect(cols[3].now).toBe(true);
  });

  it('numbers sessions so that each one starts with a focus block after a break', () => {
    for (let b = 1; b < 3000; b++) {
      const changed = sessionIndex(b) !== sessionIndex(b - 1);
      expect(changed).toBe(kindAt(b - 1) === 'break' && kindAt(b) === 'focus');
    }
  });
});

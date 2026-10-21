import { describe, expect, it } from 'vitest';
import { kindAt, sessionIndex, sessionPos } from './loop';

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

  it('counts positions from the start of each session', () => {
    for (let b = 1; b < 3000; b++) {
      if (sessionIndex(b) !== sessionIndex(b - 1)) expect(sessionPos(b)).toBe(0);
      else expect(sessionPos(b)).toBe(sessionPos(b - 1) + 1);
    }
  });

  it('numbers sessions so that each one starts with a focus block after a break', () => {
    for (let b = 1; b < 3000; b++) {
      const changed = sessionIndex(b) !== sessionIndex(b - 1);
      expect(changed).toBe(kindAt(b - 1) === 'break' && kindAt(b) === 'focus');
    }
  });
});

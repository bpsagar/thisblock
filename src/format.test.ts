import { describe, expect, it } from 'vitest';
import { fmtElapsed, fmtShort, splitMins } from './format';

describe('format', () => {
  it('formats elapsed time', () => {
    expect(fmtElapsed(0)).toBe('0:00');
    expect(fmtElapsed(754_000)).toBe('12:34');
    expect(fmtElapsed(3_725_000)).toBe('1:02:05');
  });
  it('formats the day total short', () => {
    expect(fmtShort(0)).toBe('0m');
    expect(fmtShort(45)).toBe('45m');
    expect(fmtShort(120)).toBe('2h');
    expect(fmtShort(125)).toBe('2h5m');
  });
  it('splits minutes into hours', () => {
    expect(splitMins(45)).toEqual({ h: 0, m: 45 });
    expect(splitMins(125)).toEqual({ h: 2, m: 5 });
  });
});

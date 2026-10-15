import { describe, expect, it } from 'vitest';
import { fmtElapsed, splitMins } from './format';

describe('format', () => {
  it('formats elapsed time', () => {
    expect(fmtElapsed(0)).toBe('0:00');
    expect(fmtElapsed(754_000)).toBe('12:34');
    expect(fmtElapsed(3_725_000)).toBe('1:02:05');
  });
  it('splits minutes into hours', () => {
    expect(splitMins(45)).toEqual({ h: 0, m: 45 });
    expect(splitMins(125)).toEqual({ h: 2, m: 5 });
  });
});

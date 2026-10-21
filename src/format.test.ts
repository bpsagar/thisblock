import { describe, expect, it } from 'vitest';
import { fmtClock, fmtShort } from './format';

describe('format', () => {
  it('formats the countdown', () => {
    expect(fmtClock(0)).toBe('0:00');
    expect(fmtClock(754_000)).toBe('12:34');
    expect(fmtClock(3_725_000)).toBe('1:02:05');
  });
  it('formats the day total short', () => {
    expect(fmtShort(0)).toBe('0m');
    expect(fmtShort(45)).toBe('45m');
    expect(fmtShort(120)).toBe('2h');
    expect(fmtShort(125)).toBe('2h 5m');
  });
});

import { describe, expect, it } from 'vitest';
import { barsOf } from './strip';

describe('strip', () => {
  it('makes one bar per run, named by its first block', () => {
    const bars = barsOf([{ cell: 'none' }, { cell: 'focus' }, { cell: 'final' }, { cell: 'break' }, { cell: 'unknown' }, { cell: 'unknown' }], 100);
    expect(bars).toEqual([
      { id: 'r101', cat: 'focus', from: 1, to: 3 },
      { id: 'r103', cat: 'break', from: 3, to: 4 },
      { id: 'r104', cat: 'unknown', from: 4, to: 6 },
    ]);
  });

  it('starts your bar where you came in', () => {
    const bars = barsOf([{ cell: 'focus', start: 0.4 }, { cell: 'focus' }], 7);
    expect(bars).toEqual([{ id: 'r7', cat: 'focus', from: 0.4, to: 2 }]);
  });
});

// A personal plan for someone who joins at an awkward moment.
//
// Everyone starts on focus, and every stretch of focus is 20 to 50 minutes. Joining early in a
// session needs nothing special: you simply follow the shared schedule. Joining near the end of
// a session (or during wrap up or a break) gets a short plan of your own, built from whole
// blocks: focus now, then a break of one or two blocks, after which you are back on the shared
// schedule. The plan is chosen so the person never notices anything but a normal session.

import { BLOCK_MS, blockIndex, blockStartMs, kindAt, type Cell, type Kind } from './loop';

const MIN = 60_000;
export const MIN_FOCUS = 20 * MIN;
export const MAX_FOCUS = 50 * MIN;

export interface Plan {
  /** when you joined, ms */
  join: number;
  /** first block of your break */
  breakAt: number;
  /** first block back on the shared schedule */
  syncAt: number;
}

/** the next block at or after `from` that is a shared break block */
function nextBreak(from: number): number {
  let b = from;
  while (kindAt(b) !== 'break') b++;
  return b;
}

/**
 * The plan for joining at `t`, or null when the shared schedule already works:
 * it is focus right now and the shared break comes in 20 to 50 minutes.
 */
export function makePlan(t: number): Plan | null {
  const jb = blockIndex(t);
  if (kindAt(jb) !== 'break') {
    const f = blockStartMs(nextBreak(jb)) - t;
    if (f >= MIN_FOCUS && f <= MAX_FOCUS) return null;
  }
  let mid: Plan | null = null;
  for (let breakAt = jb + 1; blockStartMs(breakAt) - t <= MAX_FOCUS; breakAt++) {
    if (blockStartMs(breakAt) - t < MIN_FOCUS) continue;
    for (const len of [1, 2]) {
      const syncAt = breakAt + len;
      if (kindAt(syncAt) === 'break') continue; // you come back to focus, never into a break
      // best: your break ends exactly when a shared session starts
      if (kindAt(syncAt - 1) === 'break') return { join: t, breakAt, syncAt };
      // otherwise come back while everyone is focusing, with at least 20 minutes before the shared break
      if (!mid && blockStartMs(nextBreak(syncAt)) - blockStartMs(syncAt) >= MIN_FOCUS) mid = { join: t, breakAt, syncAt };
    }
  }
  return mid;
}

/** what the block is for you: your plan while it runs, the shared schedule otherwise */
export function kindFor(plan: Plan | null, block: number): Kind {
  if (plan && block >= blockIndex(plan.join) && block < plan.syncAt) {
    if (block < plan.breakAt) return block === plan.breakAt - 1 ? 'final' : 'focus';
    return 'break';
  }
  return kindAt(block);
}

/**
 * What you can know about block `j` right now: past and current blocks are known; ahead, focus
 * stays hidden, and once your wrap up has started the break that follows is shown.
 */
export function cellFor(plan: Plan | null, now: number, j: number): Cell {
  const cur = blockIndex(now);
  if (j <= cur) return kindFor(plan, j);
  if (kindFor(plan, cur) === 'focus') return 'unknown';
  for (let k = cur + 1; k <= j; k++) if (kindFor(plan, k) !== 'break') return 'unknown';
  return 'break';
}

/** where your current run of focus started (for "12:34 in"), ms */
export function focusStartFor(plan: Plan | null, now: number): number {
  let b = blockIndex(now);
  if (plan && b >= blockIndex(plan.join) && b < plan.breakAt) return plan.join;
  while (kindFor(plan, b - 1) !== 'break') b--;
  return blockStartMs(b);
}

/** when your current break ends (for "4:12 left"), ms */
export function breakEndFor(plan: Plan | null, now: number): number {
  let b = blockIndex(now);
  while (kindFor(plan, b) === 'break') b++;
  return blockStartMs(b);
}

/** how many minutes your break lasts, counted from its first block */
export function breakMinsFrom(plan: Plan | null, block: number): number {
  let b = block;
  while (kindFor(plan, b) === 'break') b++;
  return ((b - block) * BLOCK_MS) / MIN;
}

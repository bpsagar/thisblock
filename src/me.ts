// The schedule as the person sees it: their own plan while it runs, the shared one otherwise.
import { blockIndex, blockStartMs, type Col, type Kind } from './loop';
import { breakEndFor, breakStartFor, cellFor, kindFor } from './plan';
import { store } from './store';
import { fmtClock } from './format';

export const myKind = (now: number): Kind => kindFor(store.plan, blockIndex(now));

export function myColumns(now: number, past: number, future: number): Col[] {
  const cur = blockIndex(now);
  const plan = store.plan;
  const seen = store.attended;
  const out: Col[] = [];
  for (let j = cur - past; j <= cur + future; j++) {
    // the past shows only blocks you were in
    const cell = j < cur ? seen[j] ?? 'none' : cellFor(plan, now, j);
    out.push({ cell });
  }
  return out;
}

/** the countdown, "36:00": focus (with wrap up) to your break, a break to its end */
export function myTimer(now: number): string {
  const plan = store.plan;
  const end = myKind(now) === 'break' ? breakEndFor(plan, now) : breakStartFor(plan, now);
  return fmtClock(Math.ceil((end - now) / 1000) * 1000);
}

/** time left in the current block */
export const myMsLeft = (now: number): number => blockStartMs(blockIndex(now) + 1) - now;

/** how many blocks of your current session are still ahead, so the strip can show all of them */
export function myAhead(now: number): number {
  const cur = blockIndex(now);
  const plan = store.plan;
  let n = 0;
  while (n < 24 && cellFor(plan, now, cur + n + 1) !== 'unknown') n++;
  return n;
}

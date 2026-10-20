// The schedule as the person sees it: their own plan while it runs, the shared one otherwise.
import { blockIndex, blockStartMs, type Col, type Kind } from './loop';
import { breakEndFor, breakStartFor, cellFor, focusStartFor, kindFor } from './plan';
import { store } from './store';
import { fmtElapsed } from './format';

export const myKind = (now: number): Kind => kindFor(store.plan, blockIndex(now));

export function myColumns(now: number, past: number, future: number): Col[] {
  const cur = blockIndex(now);
  const plan = store.plan;
  const seen = store.attended;
  const out: Col[] = [];
  for (let j = cur - past; j <= cur + future; j++) {
    // the past shows only blocks you were in
    const cell = j < cur ? seen[j] ?? 'none' : cellFor(plan, now, j);
    out.push({ cell, now: j === cur, t: blockStartMs(j) });
  }
  return out;
}

/** focus and wrap up count up out of the session's length ("12:34 of 40 min"), a break counts down */
export function myTimer(now: number): string {
  const plan = store.plan;
  if (myKind(now) === 'break') return `${fmtElapsed(Math.ceil((breakEndFor(plan, now) - now) / 1000) * 1000)} left`;
  const start = focusStartFor(plan, now);
  const total = Math.round((breakStartFor(plan, now) - start) / 60_000);
  return `${fmtElapsed(now - start)} of ${total} min`;
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

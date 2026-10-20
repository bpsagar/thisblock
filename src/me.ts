// The schedule as the person sees it: their own plan while it runs, the shared one otherwise.
import { blockIndex, blockStartMs, type Col, type Kind } from './loop';
import { breakEndFor, cellFor, focusStartFor, kindFor } from './plan';
import { store } from './store';
import { fmtElapsed } from './format';

export const myKind = (now: number): Kind => kindFor(store.plan, blockIndex(now));

export function myColumns(now: number, past: number, future: number): Col[] {
  const cur = blockIndex(now);
  const plan = store.plan;
  const out: Col[] = [];
  for (let j = cur - past; j <= cur + future; j++) out.push({ cell: cellFor(plan, now, j), now: j === cur, t: blockStartMs(j) });
  return out;
}

/** focus and wrap up count up from when your focus started, a break counts down to its end */
export function myTimer(now: number): string {
  const plan = store.plan;
  return myKind(now) === 'break'
    ? `${fmtElapsed(Math.ceil((breakEndFor(plan, now) - now) / 1000) * 1000)} left`
    : `${fmtElapsed(now - focusStartFor(plan, now))} in`;
}

/** time left in the current block */
export const myMsLeft = (now: number): number => blockStartMs(blockIndex(now) + 1) - now;

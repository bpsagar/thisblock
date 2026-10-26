// Your plan, kept in the browser: made when you start your day, grown as time goes on.
import { BLOCK_MS, blockIndex, cutAt, endAt, extend, focusNow, fresh, hold, kindAt, type Block, type Kind } from './day';
import { store, dayKey } from './store';
import { fmtClock } from './format';

const AHEAD = 36 * 60 * 60 * 1000; // how much of the plan to keep ready

let cache: Block[] | null = null;

/** the plan, from the start of today (or the start of the plan) to well past now */
export function myBlocks(now: number): Block[] {
  cache ??= store.day?.blocks ?? [];
  if (!cache.length) return cache;
  const today = new Date(now).setHours(0, 0, 0, 0);
  let next = cache;
  // what ended before today is not needed any more
  if (next[0].end < today) next = next.filter((b) => b.end >= today);
  if (!next.length) next = fresh(now);
  if (next[next.length - 1].end < now + AHEAD) next = extend(next, now + AHEAD + 12 * 60 * 60 * 1000);
  if (next !== cache) setBlocks(next, now);
  return cache;
}

export function setBlocks(blocks: Block[], now = Date.now()): void {
  cache = blocks;
  store.day = { created: store.day?.created ?? dayKey(new Date(now)), blocks };
}

/** today's plan, made now if there is none yet (you can plan before you join) */
export function ensureDay(now: number): void {
  const d = store.day;
  if (d && d.created === dayKey(new Date(now)) && d.blocks.some((b) => b.end > now)) return;
  cache = extend(fresh(now), now + AHEAD);
  store.day = { created: dayKey(new Date(now)), blocks: cache };
}

const wasIn = (t: number): boolean => !!store.attended[blockIndex(t)];

/** while you are out, the plan waits for you, starting at now */
export function holdDay(now: number): void {
  ensureDay(now);
  const blocks = myBlocks(now);
  const held = hold(blocks, now, wasIn);
  if (held !== blocks) setBlocks(held, now);
}

/** Join: the plan that waited for you starts now, with focus. */
export function startDay(now: number): void {
  holdDay(now);
  setBlocks(focusNow(myBlocks(now), now), now);
}

/** Leave: what you did of the running block stays, the rest of it waits for you. */
export function leaveDay(now: number): void {
  if (!wasIn(now)) return;
  setBlocks(cutAt(myBlocks(now), (blockIndex(now) + 1) * BLOCK_MS), now);
}

export const myKind = (now: number): Kind => kindAt(myBlocks(now), now);

/** the block that `t` is in */
export const myBlockAt = (t: number): Block | null => myBlocks(t).find((b) => b.start <= t && t < b.end) ?? null;

/** the first focus block that starts at or after `t` */
export const myNextFocus = (t: number): Block | null => myBlocks(t).find((b) => b.type === 'focus' && b.start >= t) ?? null;

/** name the block that starts at `start`; an empty name clears it */
export function nameBlock(start: number, title: string): void {
  const name = title.trim().slice(0, 60);
  setBlocks(myBlocks(Date.now()).map((b) => (b.start === start ? { ...b, title: name || undefined } : b)));
}

/** the countdown, "36:00": focus (with wrap up) to your break, a break to its end */
export function myTimer(now: number): string {
  return fmtClock(Math.ceil((endAt(myBlocks(now), now) - now) / 1000) * 1000);
}

/** how many minutes the break that starts at `t` lasts */
export function myBreakMins(t: number): number {
  return Math.round((endAt(myBlocks(t), t) - t) / 60000);
}

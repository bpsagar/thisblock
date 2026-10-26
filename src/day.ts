// Your day: focus and break blocks, end to end, with no end. A plan is made for you when you
// start, and more is made as time goes on, so it simply carries on into tomorrow. You can drag
// the edges of what is ahead; nothing that already happened changes.
//
// Every edge sits on a 5 minute mark, so the day is also a row of 5 minute slots, each wholly
// focus or break. Those slots are what minutes today are counted in.

export const BLOCK_MS = 5 * 60 * 1000;
const MIN = 60 * 1000;

export type Type = 'focus' | 'break';
/** what a moment is: the last 5 minutes of focus are wrap up */
export type Kind = 'focus' | 'final' | 'break';
export interface Block {
  type: Type;
  start: number;
  end: number;
  /** what a focus block is for, if you named it; it stays with the block when edges move */
  title?: string;
}

/** how long a block may be */
export const LIMITS: Record<Type, { min: number; max: number }> = {
  focus: { min: 15 * MIN, max: 60 * MIN },
  break: { min: 5 * MIN, max: Infinity },
};

/** the 5 minute slot that `t` falls in */
export const blockIndex = (t: number): number => Math.floor(t / BLOCK_MS);
export const blockStartMs = (b: number): number => b * BLOCK_MS;
const up5 = (t: number): number => Math.ceil(t / BLOCK_MS) * BLOCK_MS;

/** the block that follows `prev`: focus of 25 to 50 minutes, then a break of 5 or 10 */
function after(prev: Block, r: () => number): Block {
  if (prev.type === 'focus') return { type: 'break', start: prev.end, end: prev.end + (1 + Math.floor(r() * 2)) * BLOCK_MS };
  return { type: 'focus', start: prev.end, end: prev.end + (5 + Math.floor(r() * 6)) * BLOCK_MS };
}

/** a new plan that starts with focus in the 5 minutes that `now` falls in */
export function fresh(now: number, r: () => number = Math.random): Block[] {
  const start = blockStartMs(blockIndex(now));
  return [{ type: 'focus', start, end: start + (5 + Math.floor(r() * 6)) * BLOCK_MS }];
}

/** add blocks until the plan reaches `until` */
export function extend(blocks: Block[], until: number, r: () => number = Math.random): Block[] {
  const out = blocks.slice();
  while (out.length && out[out.length - 1].end < until) out.push(after(out[out.length - 1], r));
  return out;
}

function indexAt(blocks: Block[], t: number): number {
  return blocks.findIndex((b) => b.start <= t && t < b.end);
}

export function kindAt(blocks: Block[], t: number): Kind {
  const b = blocks[indexAt(blocks, t)];
  if (!b) return 'focus';
  return b.type === 'focus' && t >= b.end - BLOCK_MS ? 'final' : b.type;
}

/** when the block that `t` is in ends: for focus that is when the break starts */
export function endAt(blocks: Block[], t: number): number {
  return blocks[indexAt(blocks, t)]?.end ?? t;
}

export interface Edit { blocks: Block[]; limit: 'min' | 'max' | null }

/**
 * Move the end of block `i` to `want`. The block changes length within its limits, and
 * everything after it moves by the same amount. Edges before now stay where they are.
 */
export function resizeEnd(blocks: Block[], i: number, want: number, now: number): Edit {
  const b = blocks[i];
  const { min, max } = LIMITS[b.type];
  const lo = Math.max(b.start + min, up5(now));
  const hi = b.start + max;
  const at = Math.min(hi, Math.max(lo, Math.round(want / BLOCK_MS) * BLOCK_MS));
  const d = at - b.end;
  const out = blocks.map((x, j) => (j < i ? x : j === i ? { ...x, end: at } : { ...x, start: x.start + d, end: x.end + d }));
  const limit = want > at && at === hi ? 'max' : want < at && at === b.start + min ? 'min' : null;
  return { blocks: out, limit };
}

/**
 * Move the start of focus block `i` to `want`: it trades time with the break before it.
 * A break's start is always the end of the focus before it, so it has no start of its own to move.
 */
export function resizeStart(blocks: Block[], i: number, want: number, now: number): Edit {
  const b = blocks[i];
  const prev = blocks[i - 1];
  const { min, max } = LIMITS[b.type];
  const lo = Math.max(b.end - max, prev ? prev.start + LIMITS[prev.type].min : -Infinity, up5(now));
  const hi = b.end - min;
  const at = Math.min(hi, Math.max(lo, Math.round(want / BLOCK_MS) * BLOCK_MS));
  const out = blocks.map((x, j) => (j === i ? { ...x, start: at } : j === i - 1 ? { ...x, end: at } : x));
  const limit = want < at && at === b.end - max ? 'max' : want > at && at === hi ? 'min' : null;
  return { blocks: out, limit };
}

/**
 * Joining always starts focus. In a break, the break ends here and the next focus block moves up
 * to start now (its length and name with it); everything after it moves up by as much. In focus
 * with less than 15 minutes left, the block runs at least 15 minutes from now, and the rest of
 * the day moves later. New edges sit on the 5 minute mark that `now` falls in.
 */
export function focusNow(blocks: Block[], now: number): Block[] {
  const i = indexAt(blocks, now);
  const b = blocks[i];
  if (!b) return blocks;
  const at = blockStartMs(blockIndex(now));
  const shift = (from: number, d: number): Block[] => blocks.slice(from).map((x) => ({ ...x, start: x.start + d, end: x.end + d }));
  if (b.type === 'break') {
    const f = blocks[i + 1];
    if (!f) return blocks;
    const d = at - f.start;
    // what was left of the break is gone; what already passed of it stays
    return [...blocks.slice(0, i), ...(at > b.start ? [{ ...b, end: at }] : []), ...shift(i + 1, d)];
  }
  if (b.end - now >= LIMITS.focus.min) return blocks;
  const end = up5(now + LIMITS.focus.min);
  const d = end - b.end;
  // within an hour it simply runs longer; past that, a new block starts now and takes the name
  const keep = end - b.start <= LIMITS.focus.max || at === b.start
    ? [{ ...b, end }]
    : [{ type: b.type, start: b.start, end: at }, { ...b, start: at, end }];
  return [...blocks.slice(0, i), ...keep, ...shift(i + 1, d)];
}

/**
 * While you are out, the plan waits for you: the next block you have not been in (a focus block:
 * a break does not run without you) starts at the 5 minute mark that `now` falls in, and
 * everything after it moves with it. The time in between was time away, kept as one break.
 * `wasIn(t)` says whether you were in the 5 minutes at `t`; a block you were in stays put.
 */
export function hold(blocks: Block[], now: number, wasIn: (t: number) => boolean): Block[] {
  let at = blockStartMs(blockIndex(now));
  let i = blocks.findIndex((b) => b.end > now && !wasIn(b.start));
  if (i < 0) return blocks;
  // never before the end of a block you were in (you just left it, in its last 5 minutes)
  if (i > 0 && blocks[i - 1].end > at) at = blocks[i - 1].end;
  if (blocks[i].type === 'break') i++;
  const f = blocks[i];
  if (!f || f.start === at) return blocks;
  const d = at - f.start;
  const head = blocks.slice(0, i);
  const last = head[head.length - 1];
  if (last?.type === 'break') head[head.length - 1] = { ...last, end: at };
  else if (last) head.push({ type: 'break', start: last.end, end: at });
  return [...head.filter((b) => b.end > b.start), ...blocks.slice(i).map((b) => ({ ...b, start: b.start + d, end: b.end + d }))];
}

/** Leaving in the middle of a block: what you did of it stays, the rest is a block of its own that waits. */
export function cutAt(blocks: Block[], t: number): Block[] {
  const i = indexAt(blocks, t);
  const b = blocks[i];
  if (!b || t <= b.start || t >= b.end) return blocks;
  return [...blocks.slice(0, i), { ...b, end: t }, { ...b, start: t }, ...blocks.slice(i + 1)];
}

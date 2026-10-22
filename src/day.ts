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

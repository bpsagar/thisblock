// The one global loop. Everyone computes the same schedule from the clock,
// so no server is needed: a session is 5 to 10 focus blocks (the last one is
// "wrap up") followed by 1 or 2 break blocks. One block is 5 minutes.

export const BLOCK_MS = 5 * 60 * 1000;
const ANCHOR = Date.UTC(2026, 0, 1);

export type Kind = 'focus' | 'final' | 'break';
/** What the strip shows for one block. 'none' is a past block you were not in: it keeps its place but shows nothing */
export type Cell = Kind | 'unknown' | 'none';

interface Session {
  index: number; // session number, counted from the anchor
  start: number; // first block index of the session
  n: number; // focus blocks, the last is the wrap up block (5..10)
  b: number; // break blocks (1..2)
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sessions: Session[] = [];

function sessionShape(index: number): { n: number; b: number } {
  const r = mulberry32(index * 7919 + 13);
  const n = 5 + Math.floor(r() * 6);
  const b = 1 + Math.floor(r() * 2);
  return { n, b };
}

function extendTo(block: number): void {
  if (sessions.length === 0) sessions.push({ index: 0, start: 0, ...sessionShape(0) });
  for (;;) {
    const last = sessions[sessions.length - 1];
    if (last.start + last.n + last.b > block) return;
    sessions.push({ index: sessions.length, start: last.start + last.n + last.b, ...sessionShape(sessions.length) });
  }
}

function locate(block: number): Session {
  extendTo(block);
  let lo = 0;
  let hi = sessions.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (sessions[mid].start <= block) lo = mid;
    else hi = mid - 1;
  }
  return sessions[lo];
}

export function blockIndex(now: number): number {
  return Math.floor((now - ANCHOR) / BLOCK_MS);
}

/** Which session a block belongs to. A session is its focus blocks and the break after them. */
export function sessionIndex(block: number): number {
  return locate(block).index;
}

export function blockStartMs(block: number): number {
  return ANCHOR + block * BLOCK_MS;
}

export function kindAt(block: number): Kind {
  const s = locate(block);
  const p = block - s.start;
  if (p < s.n - 1) return 'focus';
  if (p === s.n - 1) return 'final';
  return 'break';
}

/** 0 based position of `block` inside its session: 0 is the first focus block */
export function sessionPos(block: number): number {
  return block - locate(block).start;
}

/** One column of the strip. */
export interface Col {
  cell: Cell;
}

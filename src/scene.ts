import { h } from './dom';
import type { Kind } from './loop';

// A small stage of blocks above the status word. The same eight blocks play every state:
//   focus    a slow pendulum: one soft block drifts along a row of seven, there and back every 8 s
//   wrap up  tidy up: the blocks scatter, then glide back into a neat row one by one, the orange one last
//   break    loosen up: the blocks are off duty and hop about at their own pace
// Moving from one state to the next, every block glides from where it is to where the new state
// wants it, so nothing jumps.

const N = 8; // seven row blocks and one that leads (the pendulum, the orange one, the ink hopper)
const BW = 20;
const BH = 17;
const GAP = 8;
const H = 72;
const BLEND_MS = 1400;
const PENDULUM_MS = 8000;
const TIDY_CYCLE_MS = 9000;

interface Pose { x: number; y: number; r: number; sx: number; sy: number }
type Tone = 'soft' | 'ink' | 'pend' | 'acc' | 'mut';

const ease = (p: number): number => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const lerp = (a: number, b: number, p: number): number => a + (b - a) * p;
const mix = (a: Pose, b: Pose, p: number): Pose => ({
  x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), r: lerp(a.r, b.r, p), sx: lerp(a.sx, b.sx, p), sy: lerp(a.sy, b.sy, p),
});

// a small seeded random, so a scatter is stable within one tidy cycle
function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** idle: a calm row of blocks, for the welcome and join screens */
export type SceneMode = Kind | 'idle';

export interface Scene {
  el: HTMLElement;
  set(mode: SceneMode): void;
  stop(): void;
}

/** win: the window whose frames drive the animation (the mini window has its own) */
export function createScene(win: Window = window): Scene {
  const blocks = Array.from({ length: N }, () => h('i'));
  const el = h('div', { class: 'scene', 'aria-hidden': 'true' }, ...blocks);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const width = (): number => el.clientWidth || 320;
  const rowX = (k: number, count = 7): number => (width() - (count * BW + (count - 1) * GAP)) / 2 + k * (BW + GAP);
  const mid = (H - BH) / 2;

  function focusPose(t: number): [Pose[], Tone[]] {
    const s = reduce ? 0.5 : (Math.sin((t / PENDULUM_MS) * 2 * Math.PI - Math.PI / 2) + 1) / 2;
    const poses = Array.from({ length: 7 }, (_, k) => ({ x: rowX(k), y: mid, r: 0, sx: 1, sy: 1 }));
    poses.push({ x: lerp(rowX(0), rowX(6), s), y: mid, r: 0, sx: 1, sy: 1 });
    return [poses, [...Array<Tone>(7).fill('soft'), 'pend']];
  }

  function tidyPose(t: number): [Pose[], Tone[]] {
    // the eight blocks end as one row of eight, orange last
    const row = (k: number): Pose => ({ x: rowX(k, 8), y: mid, r: 0, sx: 1, sy: 1 });
    if (reduce) return [Array.from({ length: N }, (_, k) => row(k)), [...Array<Tone>(7).fill('ink'), 'acc']];
    const cycle = Math.floor(t / TIDY_CYCLE_MS);
    const c = t % TIDY_CYCLE_MS;
    const r = rand(cycle * 7919 + 1);
    const w = width();
    const poses = Array.from({ length: N }, (_, k) => {
      const messy: Pose = { x: w * 0.12 + r() * (w * 0.76 - BW), y: r() * (H - BH), r: (r() - 0.5) * 70, sx: 1, sy: 1 };
      const out = ease(Math.min(1, c / 900)); // spill out of the row
      const back = ease(Math.min(1, Math.max(0, (c - 1300 - k * 420) / 900))); // then file back in, one by one
      return mix(mix(row(k), messy, out), row(k), back);
    });
    return [poses, [...Array<Tone>(7).fill('ink'), 'acc']];
  }

  const hop = Array.from({ length: N }, (_, k) => {
    const r = rand(k * 31 + 5);
    return { w: (2 * Math.PI) / (1100 + r() * 900), p: r() * 6, h: 14 + r() * 28, tilt: (r() - 0.5) * 36 };
  });
  function breakPose(t: number): [Pose[], Tone[]] {
    const ground = H - BH - 4;
    const poses = hop.map((b, k) => {
      const x = rowX(k, 8);
      if (reduce) return { x, y: ground, r: 0, sx: 1, sy: 1 };
      const s = Math.abs(Math.sin(t * b.w + b.p));
      const land = s < 0.14 ? 1 - s / 0.14 : 0;
      return { x, y: ground - s * b.h + land * 2, r: b.tilt * s, sx: 1 + 0.22 * land, sy: 1 - 0.26 * land };
    });
    return [poses, [...Array<Tone>(7).fill('mut'), 'ink']];
  }

  function idlePose(): [Pose[], Tone[]] {
    return [Array.from({ length: N }, (_, k) => ({ x: rowX(k, 8), y: mid, r: 0, sx: 1, sy: 1 })), [...Array<Tone>(7).fill('soft'), 'ink']];
  }

  const target = (kind: SceneMode, t: number): [Pose[], Tone[]] =>
    kind === 'idle' ? idlePose() : kind === 'focus' ? focusPose(t) : kind === 'final' ? tidyPose(t) : breakPose(t);

  let kind: SceneMode | null = null;
  let since = 0; // when the current state started, for its own clock
  let from: Pose[] | null = null; // where the blocks were when the state changed
  let current: Pose[] = [];
  let tones: Tone[] = [];
  let raf = 0;

  function frame(now: number): void {
    if (!kind) return;
    const [goal, tone] = target(kind, Math.max(0, now - since));
    const p = from ? Math.min(1, Math.max(0, (now - since) / (reduce ? 300 : BLEND_MS))) : 1;
    current = goal.map((g, k) => (from && p < 1 ? mix(from[k], g, ease(p)) : g));
    if (p >= 1) from = null;
    current.forEach((q, k) => {
      blocks[k].style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) rotate(${q.r.toFixed(1)}deg) scale(${q.sx.toFixed(3)},${q.sy.toFixed(3)})`;
      if (tones[k] !== tone[k]) blocks[k].className = tone[k];
    });
    tones = tone;
    raf = win.requestAnimationFrame(frame);
  }

  return {
    el,
    set(next) {
      if (next === kind) return;
      from = current.length ? current : null;
      kind = next;
      // frames come from `win`, so time must too (the mini window's clock starts later than the app's)
      since = win.performance.now();
      win.cancelAnimationFrame(raf);
      raf = win.requestAnimationFrame(frame);
    },
    stop() { win.cancelAnimationFrame(raf); kind = null; },
  };
}

import { h } from './dom';
import type { Kind } from './day';

// A small illustration above the status word, one per state, all made of the app's blocks.
//   focus    a tunnel of squares drifting slowly inwards, towards one steady block
//   wrap up  a loose, tilted grid draws together into a neat square, block by block
//   break    the same grid, off duty: blocks take turns to hop and wobble
// focus, wrap up and break all fill the same square, so the states rhyme.
// Each is pure CSS animation, so it keeps running in the mini window too. Changing state
// cross-fades one illustration into the next.

/** idle: not in, nothing is shown */
export type SceneMode = Kind | 'idle';

export interface Scene {
  el: HTMLElement;
  set(mode: SceneMode): void;
}

// a small seeded random, so the scatter is the same every time
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

/** a 3 by 3 grid around the centre: px offsets for block k */
const grid = (k: number): string => `--gx:${(k % 3 - 1) * 26}px;--gy:${(Math.floor(k / 3) - 1) * 26}px`;

function focus(): HTMLElement {
  return h('div', { class: 'sc-l sc-focus', 'data-m': 'focus' },
    ...Array.from({ length: 6 }, (_, k) => h('b', { style: `--d:${-k * 1.5}s` })),
    h('i'));
}

function tidy(): HTMLElement {
  const r = rand(7);
  // the outer blocks move first, the centre one settles last
  return h('div', { class: 'sc-l sc-final', 'data-m': 'final' },
    ...Array.from({ length: 9 }, (_, k) => h('i', {
      class: k === 4 ? 'ink' : '',
      style: `${grid(k)};--sr:${(r() - 0.5) * 50}deg;--d:${(Math.abs(k % 3 - 1) + Math.abs(Math.floor(k / 3) - 1)) * 0.12}s`,
    })));
}

function hop(): HTMLElement {
  const r = rand(5);
  return h('div', { class: 'sc-l sc-break', 'data-m': 'break' },
    ...Array.from({ length: 9 }, (_, k) => h('i', {
      class: k === 4 ? 'ink' : '',
      style: `${grid(k)};--sr:${(r() - 0.5) * 30}deg;--d:${-r() * 4.2}s`,
    })));
}

export function createScene(): Scene {
  const layers = [focus(), tidy(), hop()];
  const el = h('div', { class: 'scene', 'aria-hidden': 'true' }, ...layers);
  let mode: SceneMode | null = null;
  return {
    el,
    set(next) {
      if (next === mode) return;
      mode = next;
      for (const l of layers) l.classList.toggle('on', l.dataset.m === next);
    },
  };
}

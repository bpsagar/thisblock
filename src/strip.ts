import { h } from './dom';
import { BLOCK_MS, type Col } from './loop';

export interface Strip {
  el: HTMLElement;
  set(cols: Col[]): void;
  /** moves the progress bar, call every second or so */
  tick(now: number): void;
  /** how many columns fit in `width` px */
  fit(width: number): number;
}

const hourFmt = new Intl.DateTimeFormat([], { hour: 'numeric' });

/**
 * live: draw a time ruler above the blocks. Off for the first-run animation.
 */
export function createStrip(opts: { live?: boolean } = {}): Strip {
  const live = !!opts.live;
  const strip = h('div', { class: 'strip', role: 'img', 'aria-label': 'The loop. Focus blocks on top, break blocks below, unknown blocks hatched.' });
  const el = h('div', { class: `strip-wrap${live ? ' live' : ''}` }, strip);
  let nowCol: HTMLElement | null = null;
  let nowStart = 0;

  function ruler(t: number): HTMLElement | null {
    const d = new Date(t);
    const m = d.getMinutes();
    if (m === 0) return h('span', { class: 'tk hr' }, hourFmt.format(d).toLowerCase());
    if (m === 30) return h('span', { class: 'tk half' }, '30');
    return null;
  }

  return {
    el,
    set(cols) {
      if (live || strip.children.length !== cols.length) {
        strip.replaceChildren(
          ...cols.map((c) => h('div', { class: 'col' }, h('i', { class: 't' }), h('i', { class: 'b' }), live ? ruler(c.t) : null)),
        );
      }
      let found: HTMLElement | null = null;
      for (let i = 0; i < cols.length; i++) {
        const col = strip.children[i] as HTMLElement;
        col.className = `col ${cols[i].cell}${cols[i].now ? ' now' : ''}`;
        if (live && cols[i].now) { found = col; nowStart = cols[i].t; }
      }
      nowCol = found;
    },
    tick(now) {
      if (!live || !nowCol) return;
      nowCol.style.setProperty('--p', String(Math.min(1, Math.max(0, (now - nowStart) / BLOCK_MS))));
    },
    fit(width) {
      const cs = getComputedStyle(document.documentElement);
      const w = parseFloat(cs.getPropertyValue('--block-w')) || 20;
      const gap = parseFloat(cs.getPropertyValue('--space-2')) || 5;
      return Math.max(8, Math.min(32, Math.floor((width + gap) / (w + gap))));
    },
  };
}

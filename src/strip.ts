import { h } from './dom';
import { BLOCK_MS, type Cell, type Col } from './loop';

export interface Strip {
  el: HTMLElement;
  set(cols: Col[]): void;
  /** moves the play head and the fill, call every second or so */
  tick(now: number): void;
  /** how many 5 minute columns fit in `width` px */
  fit(width: number): number;
}

const hourFmt = new Intl.DateTimeFormat([], { hour: 'numeric' });

type Run = { cat: 'focus' | 'break' | 'unknown' | 'none'; from: number; to: number };
const catOf = (c: Cell): Run['cat'] => (c === 'final' ? 'focus' : c);

/** consecutive columns of the same kind become one bar: a stretch of focus, a break, the unknown */
function runsOf(cols: Col[]): Run[] {
  const out: Run[] = [];
  cols.forEach((c, i) => {
    const cat = catOf(c.cell);
    const last = out[out.length - 1];
    if (last && last.cat === cat) last.to = i;
    else out.push({ cat, from: i, to: i });
  });
  return out;
}

// sizes in the strip's own units, so the bars line up with the time ruler
const span = (n: number): string => `calc(var(--block-w) * ${n} + var(--space-2) * ${Math.max(0, n - 1)})`;
const at = (x: number): string => `calc((var(--block-w) + var(--space-2)) * ${x})`;
/** the length up to `x` columns into a bar, where x = whole columns + a fraction of the next one */
const fillTo = (x: number): string => `calc(${at(Math.floor(x))} + var(--block-w) * ${(x - Math.floor(x)).toFixed(4)})`;

/** the bars for a row of columns, with an optional play head at column `nowAt` (fractional) */
export function bars(cols: Col[], nowAt: number | null): HTMLElement[] {
  return runsOf(cols).map((r) => {
    const n = r.to - r.from + 1;
    // how much of this bar is behind the play head: all of it, none of it, or up to the play head
    const fill = nowAt === null || nowAt >= r.to + 1 ? '100%' : nowAt <= r.from ? '0px' : fillTo(nowAt - r.from);
    return h('div', { class: `run ${r.cat}`, style: `width:${span(n)};--fill:${fill}` }, h('i', { class: 't' }), h('i', { class: 'b' }));
  });
}

/** a still strip for pictures (the welcome screens): `nowAt` is where the play head sits, in columns */
export function stillStrip(cells: Cell[], nowAt: number): HTMLElement {
  const cols: Col[] = cells.map((cell, i) => ({ cell, now: i === Math.floor(nowAt), t: 0 }));
  const head = h('span', { class: 'playhead', 'aria-hidden': 'true', style: `left:${fillTo(nowAt)}` });
  return h('div', { class: 'strip', 'aria-hidden': 'true' }, ...bars(cols, nowAt), head);
}

/**
 * The loop as bars: each stretch of focus is one bar on the top lane, each break one bar on the
 * bottom lane, what is not known yet is hatched. A thin play head marks now; the part of a bar
 * ahead of it is lighter. live: draw a time ruler above.
 */
export function createStrip(opts: { live?: boolean } = {}): Strip {
  const live = !!opts.live;
  const strip = h('div', { class: 'strip', role: 'img', 'aria-label': 'The loop. Focus on top, breaks below, what is not known yet hatched.' });
  const el = h('div', { class: `strip-wrap${live ? ' live' : ''}` }, strip);
  let cols: Col[] = [];
  let nowIndex = -1;
  let head: HTMLElement | null = null;
  let nowBar: { el: HTMLElement; from: number } | null = null;

  function ruler(): HTMLElement[] {
    const out: HTMLElement[] = [];
    cols.forEach((c, i) => {
      const d = new Date(c.t);
      const m = d.getMinutes();
      if (m === 0) out.push(h('span', { class: 'tk hr', style: `left:${at(i)}` }, hourFmt.format(d).toLowerCase()));
      else if (m === 30) out.push(h('span', { class: 'tk half', style: `left:${at(i)}` }, '30'));
    });
    return out;
  }

  function place(now: number): void {
    if (nowIndex < 0) return;
    const frac = Math.min(1, Math.max(0, (now - cols[nowIndex].t) / BLOCK_MS));
    // the play head moves across the current 5 minutes, never into the gap after them
    if (head) head.style.left = fillTo(nowIndex + frac);
    if (nowBar) nowBar.el.style.setProperty('--fill', fillTo(nowIndex - nowBar.from + frac));
  }

  return {
    el,
    set(next) {
      cols = next;
      nowIndex = cols.findIndex((c) => c.now);
      const els = bars(cols, nowIndex >= 0 ? nowIndex : null);
      const rs = runsOf(cols);
      nowBar = null;
      rs.forEach((r, k) => { if (nowIndex >= r.from && nowIndex <= r.to) nowBar = { el: els[k], from: r.from }; });
      head = nowIndex >= 0 ? h('span', { class: 'playhead', 'aria-hidden': 'true' }) : null;
      strip.replaceChildren(...els, ...(live ? ruler() : []), ...(head ? [head] : []));
      place(Date.now());
    },
    tick(now) { place(now); },
    fit(width) {
      const cs = getComputedStyle(document.documentElement);
      const w = parseFloat(cs.getPropertyValue('--block-w')) || 20;
      const gap = parseFloat(cs.getPropertyValue('--space-2')) || 5;
      return Math.max(8, Math.min(32, Math.floor((width + gap) / (w + gap))));
    },
  };
}

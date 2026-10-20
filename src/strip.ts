import { h } from './dom';
import { BLOCK_MS, type Cell, type Col } from './loop';

// The loop as bars: each stretch of focus is one bar on the top lane, each break one bar on the
// bottom lane, what is not known yet is hatched. A thin play head marks now; the part of a bar
// ahead of it is lighter.
//
// Bars are keyed, so when the picture changes (a welcome screen, joining, a new block) each bar
// slides and stretches from where it was to where it belongs instead of being redrawn.

export type BarCat = 'focus' | 'break' | 'unknown';
export interface Bar { id: string; cat: BarCat; from: number; n: number }
export interface Tick { at: number; label: string; hour: boolean; key: string }
export interface Picture {
  /** how many columns the strip spans */
  total: number;
  bars: Bar[];
  /** the play head, in columns (fractional), or null for none */
  head: number | null;
  /** the play head sits on the break lane */
  low?: boolean;
  ticks?: Tick[];
}

export interface Strip {
  el: HTMLElement;
  set(p: Picture): void;
  /** how many 5 minute columns fit in `width` px */
  fit(width: number): number;
}

// sizes in the strip's own units, so the bars line up with the time ruler
const span = (n: number): string => `calc(var(--block-w) * ${n} + var(--space-2) * ${Math.max(0, n - 1)})`;
const at = (x: number): string => `calc((var(--block-w) + var(--space-2)) * ${x})`;
/** the length up to `x` columns in, where x = whole columns + a fraction of the next one */
const upTo = (x: number): string => `calc(${at(Math.floor(x))} + var(--block-w) * ${(x - Math.floor(x)).toFixed(4)})`;

const hourFmt = new Intl.DateTimeFormat([], { hour: 'numeric' });

/** the ruler marks (hours and half hours) for columns starting at `t0`, one every 5 minutes */
export function ticksFrom(t0: number, count: number): Tick[] {
  const out: Tick[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(t0 + i * BLOCK_MS);
    const m = d.getMinutes();
    if (m === 0) out.push({ at: i, label: hourFmt.format(d).toLowerCase(), hour: true, key: String(+d) });
    else if (m === 30) out.push({ at: i, label: '30', hour: false, key: String(+d) });
  }
  return out;
}

/**
 * Columns to bars. The bars of the session you are in get fixed names (`a` its focus, `b` its
 * break, `u` the unknown after), so they morph into and out of the welcome pictures; the rest
 * are named by their first block.
 */
export function barsOf(cols: Col[], firstBlock: number): Bar[] {
  const runs: { cat: BarCat | 'none'; from: number; n: number }[] = [];
  const cat = (c: Cell): BarCat | 'none' => (c === 'final' ? 'focus' : c);
  cols.forEach((c, i) => {
    const k = cat(c.cell);
    const last = runs[runs.length - 1];
    if (last && last.cat === k) last.n++;
    else runs.push({ cat: k, from: i, n: 1 });
  });
  const nowAt = cols.findIndex((c) => c.now);
  const mine = runs.findIndex((r) => nowAt >= r.from && nowAt < r.from + r.n);
  const names = new Map<number, string>();
  if (mine >= 0) {
    if (runs[mine].cat === 'focus') { names.set(mine, 'a'); if (runs[mine + 1]?.cat === 'break') names.set(mine + 1, 'b'); }
    else if (runs[mine].cat === 'break') { names.set(mine, 'b'); if (runs[mine - 1]?.cat === 'focus') names.set(mine - 1, 'a'); }
    const after = Math.max(...names.keys()) + 1;
    if (runs[after]?.cat === 'unknown') names.set(after, 'u');
  }
  const out: Bar[] = [];
  runs.forEach((r, k) => {
    if (r.cat === 'none') return;
    out.push({ id: names.get(k) ?? `r${firstBlock + r.from}`, cat: r.cat, from: r.from, n: r.n });
  });
  return out;
}

export function createStrip(): Strip {
  const strip = h('div', { class: 'mstrip', role: 'img', 'aria-label': 'The loop. Focus on top, breaks below, what is not known yet hatched.' });
  const el = h('div', { class: 'mstrip-wrap' }, strip);
  const head = h('span', { class: 'mhead', 'aria-hidden': 'true' });
  strip.append(head);
  const bars = new Map<string, HTMLElement>();
  const ticks = new Map<string, HTMLElement>();
  let shape = '';

  return {
    el,
    set(p) {
      // the same bars as last time and only the play head moved: glide it, otherwise morph everything
      const nextShape = p.bars.map((b) => `${b.id}:${b.cat}:${b.from}:${b.n}`).join('|');
      const morph = nextShape !== shape;
      shape = nextShape;
      strip.classList.toggle('morph', morph);
      strip.style.width = span(p.total);
      const seen = new Set<string>();
      for (const b of p.bars) {
        seen.add(b.id);
        let e = bars.get(b.id);
        if (!e) {
          // new bars grow in from where they stand
          e = h('div', { class: `mbar ${b.cat} enter`, style: `left:${at(b.from)};width:${span(b.n)}` });
          strip.insertBefore(e, head);
          bars.set(b.id, e);
          void e.offsetWidth;
        }
        e.className = `mbar ${b.cat}`;
        e.style.left = at(b.from);
        e.style.width = span(b.n);
        const fill = p.head === null || p.head >= b.from + b.n ? '100%' : p.head <= b.from ? '0px' : upTo(p.head - b.from);
        e.style.setProperty('--fill', fill);
      }
      for (const [id, e] of bars) {
        if (seen.has(id)) continue;
        bars.delete(id);
        e.classList.add('leave');
        window.setTimeout(() => e.remove(), 700);
      }
      // the time ruler
      const seenTicks = new Set<string>();
      for (const t of p.ticks ?? []) {
        seenTicks.add(t.key);
        let e = ticks.get(t.key);
        if (!e) {
          e = h('span', { class: `mtk${t.hour ? ' hr' : ''}` }, t.label);
          strip.insertBefore(e, head);
          ticks.set(t.key, e);
        }
        e.style.left = at(t.at);
      }
      for (const [key, e] of ticks) if (!seenTicks.has(key)) { ticks.delete(key); e.remove(); }
      head.style.opacity = p.head === null ? '0' : '1';
      if (p.head !== null) head.style.left = upTo(p.head);
      head.classList.toggle('low', !!p.low);
    },
    fit(width) {
      const cs = getComputedStyle(document.documentElement);
      const w = parseFloat(cs.getPropertyValue('--block-w')) || 20;
      const gap = parseFloat(cs.getPropertyValue('--space-2')) || 5;
      return Math.max(8, Math.min(32, Math.floor((width + gap) / (w + gap))));
    },
  };
}

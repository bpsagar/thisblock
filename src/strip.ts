import { h } from './dom';
import { BLOCK_MS, type Col } from './loop';

// The loop as bars: each stretch of focus is one bar on the top lane, each break one bar on the
// bottom lane, what is not known yet is hatched. A thin play head marks now; the part of a bar
// ahead of it is lighter.
//
// Bars are keyed by their first block, so when the picture changes (a new block, a resize) each
// bar slides and stretches from where it was to where it belongs instead of being redrawn.

export type BarCat = 'focus' | 'break' | 'unknown';
/** a bar from column `from` (may be fractional) to the end of column `to` - 1 */
export interface Bar { id: string; cat: BarCat; from: number; to: number }
export interface Tick { at: number; label: string; hour: boolean; key: string }
export interface Picture {
  /** how many columns the strip spans */
  total: number;
  bars: Bar[];
  /** the play head, in columns (fractional), or null for none */
  head: number | null;
  /** the past, up to here in columns, is a grey track that the blocks you were in sit on */
  track?: number;
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

/** the width from `from` columns in to the end of column `to` - 1 */
const between = (from: number, to: number): string => `calc(${at(to)} - var(--space-2) - ${upTo(from)})`;

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
 * Columns to bars: each run of focus or break is one bar, named by its first block. A bar starts
 * part way into its first block when that is where you came in.
 */
export function barsOf(cols: Col[], firstBlock: number): Bar[] {
  const out: Bar[] = [];
  let last: { cat: BarCat | 'none'; at: number; from: number; to: number } | null = null;
  const flush = (): void => { if (last && last.cat !== 'none') out.push({ id: `r${firstBlock + last.at}`, cat: last.cat, from: last.from, to: last.to }); };
  cols.forEach((c, i) => {
    const k = c.cell === 'final' ? 'focus' : c.cell;
    if (last && last.cat === k) last.to = i + 1;
    else { flush(); last = { cat: k, at: i, from: i + (c.start ?? 0), to: i + 1 }; }
  });
  flush();
  return out;
}

export function createStrip(): Strip {
  const strip = h('div', { class: 'mstrip', role: 'img', 'aria-label': 'The loop. Focus on top, breaks below, what is not known yet hatched.' });
  const el = h('div', { class: 'mstrip-wrap' }, strip);
  const head = h('span', { class: 'mhead', 'aria-hidden': 'true' });
  const track = h('span', { class: 'mtrack', 'aria-hidden': 'true' });
  strip.append(track, head);
  const bars = new Map<string, HTMLElement>();
  const ticks = new Map<string, HTMLElement>();
  let shape = '';

  return {
    el,
    set(p) {
      // the same bars as last time and only the play head moved: glide it, otherwise morph everything
      const nextShape = p.bars.map((b) => `${b.id}:${b.cat}:${b.from}:${b.to}`).join('|');
      const morph = nextShape !== shape;
      shape = nextShape;
      strip.classList.toggle('morph', morph);
      strip.style.width = span(p.total);
      const seen = new Set<string>();
      let born = 0; // bars that appear together come in one after another
      for (const b of p.bars) {
        seen.add(b.id);
        let e = bars.get(b.id);
        if (!e) {
          // a new bar draws itself in: focus grows from its start, a break drops in, the unknown fades up
          e = h('div', { class: `mbar ${b.cat} in`, style: `left:${upTo(b.from)};width:${between(b.from, b.to)};--in-delay:${born * 160}ms` });
          strip.insertBefore(e, head);
          bars.set(b.id, e);
          born++;
          e.addEventListener('animationend', () => e!.classList.remove('in'), { once: true });
        }
        e.className = `mbar ${b.cat}${e.classList.contains('in') ? ' in' : ''}`;
        e.style.left = upTo(b.from);
        e.style.width = between(b.from, b.to);
        const fill = p.head === null || p.head >= b.to ? '100%' : p.head <= b.from ? '0px' : `calc(${upTo(p.head)} - ${upTo(b.from)})`;
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
      track.style.width = p.track ? upTo(p.track) : '0px';
      head.style.opacity = p.head === null ? '0' : '1';
      if (p.head !== null) head.style.left = upTo(p.head);
      head.classList.toggle('low', !!p.low);
    },
    fit(width) {
      // read the sizes where the strip is shown: the mini window has its own (narrower) layout
      const cs = (strip.ownerDocument.defaultView ?? window).getComputedStyle(strip);
      const w = parseFloat(cs.getPropertyValue('--block-w')) || 20;
      const gap = parseFloat(cs.getPropertyValue('--space-2')) || 5;
      return Math.max(8, Math.min(32, Math.floor((width + gap) / (w + gap))));
    },
  };
}

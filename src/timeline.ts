import { h } from './dom';
import { blockIndex, blockStartMs, resizeEnd, resizeStart, type Block, type Kind } from './day';
import { fmtShort } from './format';

// Your day as two lanes, focus on top and breaks below, from a little before you started to a
// few hours ahead; the plan carries on past the right edge. What you were in is solid, what you
// missed is hatched (empty), what is ahead is lighter. A line marks now.
//
// The edges ahead of now can be dragged. Hovering one turns its block solid, and dragging snaps
// to 5 minutes, with the block's length inside it. A block's right edge moves everything after
// it; a focus block's left edge trades with the break before it. Esc puts it back.

const HOUR = 60 * 60 * 1000;
const LANE = 30;
const GAP = 6;
const REACH = 10; // px past a block's edge that still grab it: the other lane leaves room there

export interface Timeline {
  el: HTMLElement;
  render(now: number): void;
}

interface Options {
  blocks(now: number): Block[];
  /** the slots you were in */
  attended(): Record<string, Kind>;
  /** a change while dragging (and the original back on Esc) */
  change(blocks: Block[]): void;
}

const hourFmt = new Intl.DateTimeFormat([], { hour: 'numeric' });

export function createTimeline(opts: Options): Timeline {
  const lanes = h('div', { class: 'tl-lanes' });
  const el = h('div', { class: 'tl' }, lanes);
  const segs: HTMLElement[] = [];
  let view = { a: 0, b: 1 };
  let shown: Block[] = [];
  let hover: { i: number; side: 'start' | 'end' } | null = null;
  let drag: { i: number; side: 'start' | 'end'; limit: string } | null = null;
  let lastNow = Date.now();

  const W = (): number => lanes.clientWidth || 1;
  const x = (t: number): number => ((t - view.a) / (view.b - view.a)) * W();
  const toTime = (px: number): number => view.a + (px / W()) * (view.b - view.a);

  // from a little before your first slot today (or now) to a few hours ahead, at least to 7 pm
  function fit(now: number, blocks: Block[]): void {
    const today = new Date(now).setHours(0, 0, 0, 0);
    const seen = Object.keys(opts.attended()).map(Number).filter((k) => blockStartMs(k) >= today);
    const cur = blocks.find((b) => b.start <= now && now < b.end);
    const first = Math.min(now, cur?.start ?? now, ...seen.map(blockStartMs));
    const a = new Date(first - HOUR / 2); a.setMinutes(0, 0, 0);
    const b = Math.max(new Date(now).setHours(19, 0, 0, 0), Math.ceil((now + 4 * HOUR) / HOUR) * HOUR);
    view = { a: +a, b };
  }

  function render(now: number): void {
    lastNow = now;
    const blocks = opts.blocks(now);
    if (!drag) fit(now, blocks);
    shown = blocks.filter((b) => b.end > view.a && b.start < view.b + HOUR);
    const seen = opts.attended();
    el.querySelectorAll('.tl-tk,.tl-now,.tl-past').forEach((e) => e.remove());
    // the ruler: hours, with fewer labels when it is narrow (the mini window)
    const every = W() / ((view.b - view.a) / HOUR) < 44 ? 3 : 1;
    for (let t = view.a; t <= view.b; t += HOUR / 2) {
      const d = new Date(t);
      const hr = d.getMinutes() === 0;
      el.append(h('span', { class: `tl-tk${hr ? ' hr' : ''}`, style: `left:${x(t)}px` }, hr && d.getHours() % every === 0 ? hourFmt.format(d).toLowerCase() : ''));
    }
    while (segs.length < shown.length) { const s = h('div'); lanes.append(s); segs.push(s); }
    while (segs.length > shown.length) segs.pop()!.remove();
    shown.forEach((b, i) => {
      const e = segs[i];
      const held = drag?.i === i;
      e.className = `tl-seg ${b.type}${held ? ' held' : !drag && hover?.i === i ? ' hot' : ''}`;
      const left = x(b.start);
      e.style.left = `${left + 1}px`;
      e.style.width = `${Math.max(1, x(b.end) - left - 2)}px`;
      // the past slot by slot (you were in it, or not), then the rest of the block
      let html = '';
      const piece = (p: number, q: number, cls: string): void => { if (q > p) html += `<i class="${cls}" style="left:${x(p) - left - 1}px;width:${x(q) - x(p)}px"></i>`; };
      let run = b.start;
      let runIn = !!seen[blockIndex(b.start)];
      for (let t = b.start; t < Math.min(now, b.end); t += blockStartMs(1)) {
        const inn = !!seen[blockIndex(t)];
        if (inn !== runIn) { piece(run, t, runIn ? 'done' : 'miss'); run = t; runIn = inn; }
      }
      piece(run, Math.min(now, b.end), runIn ? 'done' : 'miss');
      piece(Math.max(now, b.start), b.end, 'ahead');
      if (held) html += `<span class="tl-len">${drag!.limit || fmtShort(Math.round((b.end - b.start) / 60000))}</span>`;
      e.innerHTML = html;
    });
    lanes.append(h('div', { class: 'tl-past', style: `width:${Math.max(0, x(now))}px` }));
    el.append(h('div', { class: 'tl-now', style: `left:${x(now)}px` }));
  }

  // which edge is under the cursor: a break only has its right edge, its left one belongs to the focus before it
  function hit(px: number, py: number): { i: number; side: 'start' | 'end'; locked: boolean } | null {
    if (py < 0 || py > 2 * LANE + GAP) return null;
    const lane = py < LANE + GAP / 2 ? 'focus' : 'break';
    let best: { i: number; side: 'start' | 'end'; d: number } | null = null;
    shown.forEach((b, i) => {
      if (b.type !== lane) return;
      const xs = x(b.start), xe = x(b.end), mid = (xs + xe) / 2;
      const reach = Math.max(6, Math.min(REACH, (xe - xs) / 3));
      const sides: ['start' | 'end', number, boolean][] = b.type === 'break' ? [['end', xe, true]] : [['start', xs, px <= mid], ['end', xe, px > mid]];
      for (const [side, at, ok] of sides) {
        const d = Math.abs(px - at);
        if (ok && d <= reach && (!best || d < best.d)) best = { i, side, d };
      }
    });
    if (!best) return null;
    const { i, side } = best as { i: number; side: 'start' | 'end' };
    const at = side === 'start' ? shown[i].start : shown[i].end;
    return { i, side, locked: at < Math.ceil(lastNow / blockStartMs(1)) * blockStartMs(1) };
  }

  lanes.addEventListener('pointermove', (e) => {
    if (drag) return;
    const r = lanes.getBoundingClientRect();
    const got = hit(e.clientX - r.left, e.clientY - r.top);
    const next = got && !got.locked ? { i: got.i, side: got.side } : null;
    lanes.style.cursor = got ? (got.locked ? 'not-allowed' : 'ew-resize') : '';
    if (next?.i !== hover?.i || next?.side !== hover?.side) { hover = next; render(Date.now()); }
  });
  lanes.addEventListener('pointerleave', () => { if (!drag && hover) { hover = null; render(Date.now()); } });
  lanes.addEventListener('pointerdown', (e) => { if (hover && e.button === 0) startDrag(e, hover.i, hover.side); });

  function startDrag(ev: PointerEvent, i: number, side: 'start' | 'end'): void {
    ev.preventDefault();
    const win = el.ownerDocument.defaultView ?? window;
    const all = opts.blocks(Date.now());
    const orig = all.slice();
    const at = all.findIndex((b) => b.start === shown[i].start);
    drag = { i, side, limit: '' };
    el.ownerDocument.body.style.cursor = 'ew-resize';
    const r = lanes.getBoundingClientRect();
    const apply = (clientX: number): void => {
      const want = toTime(clientX - r.left);
      const edit = side === 'end' ? resizeEnd(orig, at, want, Date.now()) : resizeStart(orig, at, want, Date.now());
      const b = edit.blocks[at];
      drag!.limit = edit.limit ? `${fmtShort((b.end - b.start) / 60000)} ${edit.limit}` : '';
      opts.change(edit.blocks);
      render(Date.now());
    };
    const move = (e: PointerEvent): void => apply(e.clientX);
    const finish = (keep: boolean): void => {
      win.removeEventListener('pointermove', move);
      win.removeEventListener('pointerup', up);
      win.removeEventListener('keydown', key, true);
      if (!keep) opts.change(orig);
      drag = null;
      hover = null;
      el.ownerDocument.body.style.cursor = '';
      render(Date.now());
    };
    const up = (): void => finish(true);
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.stopPropagation(); finish(false); } };
    win.addEventListener('pointermove', move);
    win.addEventListener('pointerup', up);
    win.addEventListener('keydown', key, true);
    apply(ev.clientX);
  }

  return { el, render };
}

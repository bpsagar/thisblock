import { h } from './dom';
import { blockIndex, blockStartMs, resizeEnd, resizeStart, type Block, type Kind } from './day';
import { fmtShort } from './format';

// Your day as two lanes, focus on top and breaks below, from a little before you started to
// several hours ahead; the plan carries on past the right edge. An hour is at least 120px wide,
// so blocks keep their size on a phone: the day scrolls sideways when it does not fit. What you were in is solid, what you
// missed is hatched across both lanes (empty), what is ahead is lighter. A line marks now.
//
// The edges ahead of now can be dragged. Hovering one turns its block solid, and dragging snaps
// to 5 minutes, with the block's length inside it. A block's right edge moves everything after
// it; a focus block's left edge trades with the break before it. Esc puts it back.
//
// Double-clicking a focus block (the running one or one ahead) names it. A named block has a
// small dot, and its name shows above it on hover.

const HOUR = 60 * 60 * 1000;
const LANE = 30;
const GAP = 6;
const REACH = 10; // px past a block's edge that still grab it: the other lane leaves room there
const MIN_HOUR = 120; // px

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
  /** name the block that starts at `start` */
  name(start: number, title: string): void;
}

const hourFmt = new Intl.DateTimeFormat([], { hour: 'numeric' });

export function createTimeline(opts: Options): Timeline {
  const lanes = h('div', { class: 'tl-lanes' });
  const inner = h('div', { class: 'tl-in' }, lanes);
  const el = h('div', { class: 'tl' }, inner);
  const segs: HTMLElement[] = [];
  let view = { a: 0, b: 1 };
  let shown: Block[] = [];
  let hover: { i: number; side: 'start' | 'end' } | null = null;
  let drag: { i: number; side: 'start' | 'end'; limit: string } | null = null;
  let lastNow = Date.now();
  let placed = 0; // the start of the view the scroll was placed for
  let editing: number | null = null; // the start of the block being named
  let peekAt: number | null = null; // the start of the named block under the cursor

  const W = (): number => lanes.clientWidth || 1;
  const x = (t: number): number => ((t - view.a) / (view.b - view.a)) * W();
  const toTime = (px: number): number => view.a + (px / W()) * (view.b - view.a);

  // from a little before your first slot today (and at least two hours back, so the empty past
  // shows) to a few hours ahead, at least to 7 pm
  function fit(now: number, blocks: Block[]): void {
    const today = new Date(now).setHours(0, 0, 0, 0);
    const seen = Object.keys(opts.attended()).map(Number).filter((k) => blockStartMs(k) >= today);
    const cur = blocks.find((b) => b.start <= now && now < b.end);
    const first = Math.min(now - 2 * HOUR, cur?.start ?? now, ...seen.map(blockStartMs));
    const a = new Date(first - HOUR / 2); a.setMinutes(0, 0, 0);
    const b = Math.max(new Date(now).setHours(19, 0, 0, 0), Math.ceil((now + 8 * HOUR) / HOUR) * HOUR);
    view = { a: +a, b };
  }

  function render(now: number): void {
    lastNow = now;
    const blocks = opts.blocks(now);
    if (!drag) fit(now, blocks);
    const hours = (view.b - view.a) / HOUR;
    inner.style.width = `${Math.max(el.clientWidth, hours * MIN_HOUR)}px`;
    // open with now a third of the way in; after that, leave the scroll where you put it
    if (el.clientWidth && placed !== view.a) { placed = view.a; el.scrollLeft = x(now) - el.clientWidth / 3; }
    shown = blocks.filter((b) => b.end > view.a && b.start < view.b + HOUR);
    const seen = opts.attended();
    inner.querySelectorAll('.tl-tk,.tl-now,.tl-miss,.tl-len,.tl-peek').forEach((e) => e.remove());
    // the ruler: hours, with fewer labels when it is narrow (the mini window)
    const every = W() / ((view.b - view.a) / HOUR) < 44 ? 3 : 1;
    for (let t = view.a; t <= view.b; t += HOUR / 2) {
      const d = new Date(t);
      const hr = d.getMinutes() === 0;
      inner.append(h('span', { class: `tl-tk${hr ? ' hr' : ''}`, style: `left:${x(t)}px` }, hr && d.getHours() % every === 0 ? hourFmt.format(d).toLowerCase() : ''));
    }
    while (segs.length < shown.length) { const s = h('div'); lanes.append(s); segs.push(s); }
    while (segs.length > shown.length) segs.pop()!.remove();
    shown.forEach((b, i) => {
      const e = segs[i];
      const held = drag?.i === i;
      e.className = `tl-seg ${b.type}${held ? ' held' : !drag && hover?.i === i ? ' hot' : ''}${editing === b.start ? ' naming' : ''}${peekAt === b.start ? ' peeked' : ''}`;
      const left = x(b.start);
      e.style.left = `${left + 1}px`;
      e.style.width = `${Math.max(1, x(b.end) - left - 2)}px`;
      // the past you were in, then the rest of the block (what you missed is drawn across both lanes below)
      let html = '';
      const piece = (p: number, q: number, cls: string): void => { if (q > p) html += `<i class="${cls}" style="left:${x(p) - left - 1}px;width:${x(q) - x(p)}px"></i>`; };
      let run = b.start;
      let runIn = !!seen[blockIndex(b.start)];
      for (let t = b.start; t < Math.min(now, b.end); t += blockStartMs(1)) {
        const inn = !!seen[blockIndex(t)];
        if (inn !== runIn) { if (runIn) piece(run, t, 'done'); run = t; runIn = inn; }
      }
      if (runIn) piece(run, Math.min(now, b.end), 'done');
      piece(Math.max(now, b.start), b.end, 'ahead');
      if (b.title && x(b.end) - left > 16) html += '<b class="tl-mk"></b>';
      e.innerHTML = html;
      // the length sits over the block, outside it, so a short block keeps its rounded corners
      if (held) lanes.append(h('div', { class: `tl-len ${b.type}`, style: `left:${(x(b.start) + x(b.end)) / 2}px` }, drag!.limit || fmtShort(Math.round((b.end - b.start) / 60000))));
    });
    // the past you were not in, before your plan started too: one hatched stretch over both lanes
    const step = blockStartMs(1);
    let from: number | null = null;
    const miss = (p: number, q: number): void => { lanes.append(h('div', { class: 'tl-miss', style: `left:${x(p) + 1}px;width:${Math.max(0, x(q) - x(p) - 2)}px` })); };
    for (let t = Math.floor(view.a / step) * step; t < now; t += step) {
      if (!seen[blockIndex(t)]) from ??= t;
      else if (from !== null) { miss(from, t); from = null; }
    }
    if (from !== null) miss(from, now);
    inner.append(h('div', { class: 'tl-now', style: `left:${x(now)}px` }));
    const pk = shown.find((b) => b.start === peekAt);
    if (pk?.title) inner.append(h('div', { class: 'tl-peek', style: `left:${(x(pk.start) + x(pk.end)) / 2}px` }, pk.title));
  }

  /** the block under a point in the lanes */
  function bodyAt(px: number, py: number): Block | undefined {
    const lane = py < LANE + GAP / 2 ? 'focus' : 'break';
    return shown.find((b) => b.type === lane && x(b.start) <= px && px < x(b.end));
  }

  // naming a block: a field opens right above it (outside the day's faded edges)
  function openNaming(b: Block): void {
    closeNaming(false);
    editing = b.start;
    peekAt = null;
    const card = el.parentElement ?? el;
    const mid = (x(Math.max(b.start, lastNow)) + x(b.end)) / 2 - el.scrollLeft;
    const input = h('input', { maxlength: '60', placeholder: 'what is this one for?', spellcheck: 'false' }) as HTMLInputElement;
    const box = h('div', { class: 'tl-name', style: `left:${el.offsetLeft + Math.min(el.clientWidth - 160, Math.max(160, mid))}px;top:${el.offsetTop + 24}px` }, input, h('span', { class: 'key' }, 'enter'));
    card.append(box);
    input.value = b.title ?? '';
    input.focus();
    input.select();
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') closeNaming(true);
      else if (e.key === 'Escape') { e.stopPropagation(); closeNaming(false); }
    });
    input.addEventListener('blur', () => closeNaming(true));
    render(Date.now());
  }
  function closeNaming(save: boolean): void {
    const box = (el.parentElement ?? el).querySelector<HTMLElement>('.tl-name');
    if (!box || box.dataset.closing) return;
    box.dataset.closing = '1'; // removing it blurs the field, which would close it again
    if (save && editing !== null) opts.name(editing, box.querySelector('input')!.value);
    box.remove();
    editing = null;
    render(Date.now());
  }
  lanes.addEventListener('dblclick', (e) => {
    const r = lanes.getBoundingClientRect();
    const b = bodyAt(e.clientX - r.left, e.clientY - r.top);
    if (b?.type === 'focus' && b.end > Date.now()) openNaming(b);
  });

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
    // over the middle of a named block: its name above it
    const body = got ? undefined : bodyAt(e.clientX - r.left, e.clientY - r.top);
    const pk = body?.title && editing === null ? body.start : null;
    if (next?.i !== hover?.i || next?.side !== hover?.side || pk !== peekAt) { hover = next; peekAt = pk; render(Date.now()); }
  });
  // a mouse wheel scrolls the day sideways
  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, { passive: false });
  lanes.addEventListener('pointerleave', () => { if (!drag && (hover || peekAt !== null)) { hover = null; peekAt = null; render(Date.now()); } });
  lanes.addEventListener('pointerdown', (e) => { if (hover && e.button === 0) startDrag(e, hover.i, hover.side); });

  function startDrag(ev: PointerEvent, i: number, side: 'start' | 'end'): void {
    ev.preventDefault();
    const win = el.ownerDocument.defaultView ?? window;
    const all = opts.blocks(Date.now());
    const orig = all.slice();
    const at = all.findIndex((b) => b.start === shown[i].start);
    drag = { i, side, limit: '' };
    el.ownerDocument.body.style.cursor = 'ew-resize';
    let lastX = ev.clientX;
    const apply = (clientX: number): void => {
      lastX = clientX;
      const want = toTime(clientX - lanes.getBoundingClientRect().left);
      const edit = side === 'end' ? resizeEnd(orig, at, want, Date.now()) : resizeStart(orig, at, want, Date.now());
      const b = edit.blocks[at];
      drag!.limit = edit.limit ? `${fmtShort((b.end - b.start) / 60000)} ${edit.limit}` : '';
      opts.change(edit.blocks);
      render(Date.now());
    };
    const move = (e: PointerEvent): void => apply(e.clientX);
    // held near either end, the day scrolls along
    let raf = 0;
    const edgeScroll = (): void => {
      const box = el.getBoundingClientRect();
      const d = lastX < box.left + 40 ? -1 : lastX > box.right - 40 ? 1 : 0;
      if (d) { el.scrollLeft += d * 8; apply(lastX); }
      raf = win.requestAnimationFrame(edgeScroll);
    };
    raf = win.requestAnimationFrame(edgeScroll);
    const finish = (keep: boolean): void => {
      win.cancelAnimationFrame(raf);
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

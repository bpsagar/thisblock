import { h, key, topbar } from './dom';
import { createScene } from './scene';
import { createTimeline } from './timeline';
import { LABEL } from './copy';
import { fmtShort } from './format';
import { myBlockAt, myBlocks, myKind, myNextFocus, myTimer, nameBlock, setBlocks } from './me';
import { store } from './store';
import { createOdometer } from './odometer';

// One stage for the whole app, in two modes. The join screen is just the day so far and the
// join button. When you are in, it shows the illustration, a small label and a big countdown,
// and your day's plan, which you can reshape by dragging.

export type Mode = 'join' | 'live';

/** what you did since you joined: those minutes are added in on the join screen */
export interface Summary { mins: number }

const reduce = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Stage {
  el: HTMLElement;
  show(mode: Mode, summary?: Summary | null): void;
  readonly mode: Mode;
  /** redraw the plan: on block change, resize, join and leave */
  paint(now: number): void;
  /** every tick */
  tick(now: number): void;
}

interface Options {
  join(): void;
  /** minutes of focus today, for the stats on the join screen */
  todayMins(): number;
  /** the leave button and today's bar */
  actions: HTMLElement;
  /** the settings drop-down; without one there is no top bar (the mini window) */
  menu?: HTMLElement;
}

export function createStage(opts: Options): Stage {
  const scene = createScene();
  const timeline = createTimeline({ blocks: myBlocks, attended: () => store.attended, change: (b) => setBlocks(b), name: nameBlock });

  // your state: a small label and a big countdown
  const word = h('div', { class: 'word', role: 'status', 'aria-live': 'polite' }, '');
  // the countdown is what you look for, so it is the big thing; the state is a small label above it
  const odo = createOdometer('count');
  // and under it, what this focus is for (in a break: what is next)
  const name = h('div', { class: 'st-name' });
  const live = h('div', { class: 'st-live' }, word, odo.el, name);
  const title = h('div', { class: 'st-title' }, live);

  const card = h('div', { class: 'card st-card' }, timeline.el);

  // the join screen is just the day so far and the join button
  const day = createDay();
  const joinBtn = h('button', { class: 'btn primary', onClick: () => opts.join() }, 'join', key('enter'));
  const joinArea = h('div', { class: 'st-joinarea' }, joinBtn);
  const foot = h('div', { class: 'st-foot' }, joinArea, opts.actions);

  const el = h('div', { class: 'st', 'data-mode': 'join' },
    opts.menu ? topbar(opts.menu) : null,
    h('main', { class: 'st-main' }, scene.el, title, card, day.el, foot),
  );

  let mode: Mode = 'join';
  let lastLabel = '';
  let lastTimer = '';
  let wordSwap = 0;
  let lastSecond = 0;
  let nameKey = '';
  let naming = false;

  function paintName(now: number): void {
    if (naming) return;
    const b = myBlockAt(now);
    const next = b?.type === 'break' ? myNextFocus(b.end) : null;
    const key = b?.type === 'focus' ? `f${b.start}:${b.title ?? ''}` : `b${next?.start}:${next?.title ?? ''}`;
    if (key === nameKey) return;
    nameKey = key;
    if (b?.type === 'focus') {
      const t = h('button', { class: `st-name-t${b.title ? '' : ' empty'}`, onClick: () => editName(b) }, b.title ?? 'name this focus');
      name.replaceChildren(t);
    } else {
      name.replaceChildren(...(next?.title ? [h('span', { class: 'st-name-t next' }, 'next: ', h('b', null, next.title))] : []));
    }
  }
  // the name under the countdown changes right where it is
  function editName(b: { start: number; title?: string }): void {
    naming = true;
    const input = h('input', { maxlength: '60', placeholder: 'what is this one for?', spellcheck: 'false' }) as HTMLInputElement;
    name.replaceChildren(h('span', { class: 'st-name-ed' }, input));
    input.value = b.title ?? '';
    input.focus();
    input.select();
    const done = (save: boolean): void => {
      if (!naming) return;
      naming = false;
      if (save) nameBlock(b.start, input.value);
      nameKey = '';
      paintName(Date.now());
      timeline.render(Date.now());
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
    input.addEventListener('blur', () => done(true));
  }

  const api: Stage = {
    el,
    get mode() { return mode; },
    show(next, summary) {
      mode = next;
      el.dataset.mode = next;
      if (next === 'join') {
        scene.set('idle');
        // the day fills in: all of it when the app opens, just the minutes you added when you leave
        const total = opts.todayMins();
        day.show(summary ? Math.max(0, total - summary.mins) : 0, total);
      } else {
        lastLabel = '';
      }
      api.paint(Date.now());
      api.tick(Date.now());
    },
    paint(now) {
      if (mode === 'live') timeline.render(now);
    },
    tick(now) {
      if (mode !== 'live') return;
      const kind = myKind(now);
      scene.set(kind);
      const label = LABEL[kind];
      if (label !== lastLabel) {
        // the old word blurs away and the new one comes into focus
        const first = lastLabel === '';
        lastLabel = label;
        window.clearTimeout(wordSwap);
        word.classList.add('out');
        wordSwap = window.setTimeout(() => { word.textContent = label; word.classList.remove('out'); }, first ? 0 : 450);
      }
      const t = myTimer(now);
      if (t !== lastTimer) { odo.set(t); lastTimer = t; }
      paintName(now);
      // now moves along the plan on its own, a pixel at most a second
      if (Math.floor(now / 1000) !== lastSecond) { lastSecond = Math.floor(now / 1000); timeline.render(now); }
    },
  };
  return api;
}

/**
 * The day so far, for the join screen: a big total and a bar of 5 minute segments (four hours,
 * growing by the hour). It counts up from `from` to `to`; the minutes in between fill in one
 * segment after another and are shown as what you just added.
 */
function createDay(): { el: HTMLElement; show(from: number, to: number): void } {
  const num = h('div', { class: 'day-num' }, '0m');
  const added = h('div', { class: 'day-add' }, '');
  const bar = h('div', { class: 'day-bar', role: 'img' });
  const el = h('div', { class: 'day' }, h('div', { class: 'day-top' }, num, added), bar, h('div', { class: 'day-cap' }, 'today'));
  let raf = 0;
  let timers: number[] = [];
  return {
    el,
    show(from, to) {
      window.cancelAnimationFrame(raf);
      timers.forEach(window.clearTimeout);
      timers = [];
      const total = Math.floor(to / 5);
      const start = Math.floor(from / 5);
      const count = Math.max(48, Math.ceil((total + 1) / 12) * 12);
      const segs = Array.from({ length: count }, (_, i) => h('i', { class: `${i > 0 && i % 12 === 0 ? 'h ' : ''}${i < start ? 'on' : ''}` }));
      bar.replaceChildren(...segs);
      bar.setAttribute('aria-label', `${fmtShort(to)} of focus today`);
      const gain = to - from;
      added.textContent = from > 0 && gain > 0 ? `+${fmtShort(gain)}` : '';
      added.classList.remove('in');
      if (reduce() || gain <= 0) {
        segs.forEach((g, i) => g.classList.toggle('on', i < total));
        num.textContent = fmtShort(to);
        return;
      }
      // the new segments fill one after another while the number counts up with them
      const n = total - start;
      const step = Math.max(25, Math.min(90, 1400 / Math.max(1, n)));
      for (let i = start; i < total; i++) timers.push(window.setTimeout(() => segs[i].classList.add('on', 'new'), 300 + (i - start) * step));
      const dur = 300 + n * step;
      const t0 = performance.now();
      const tick = (t: number): void => {
        const p = Math.min(1, Math.max(0, (t - t0 - 300) / (dur - 300)));
        const e = 1 - Math.pow(1 - p, 3);
        num.textContent = fmtShort(Math.round((from + gain * e) / 5) * 5);
        if (p < 1) raf = window.requestAnimationFrame(tick);
        else { num.textContent = fmtShort(to); if (added.textContent) added.classList.add('in'); }
      };
      num.textContent = fmtShort(from);
      raf = window.requestAnimationFrame(tick);
    },
  };
}

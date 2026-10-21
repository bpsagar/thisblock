import { h, key, topbar } from './dom';
import { BLOCK_MS, blockIndex, blockStartMs } from './loop';
import { createScene } from './scene';
import { barsOf, createStrip, ticksFrom, type Picture } from './strip';
import { LABEL } from './copy';
import { fmtShort } from './format';
import { myAhead, myColumns, myKind, myTimer } from './me';
import { createOdometer } from './odometer';

// One stage for the whole app, in two modes. The join screen is just the day so far and the
// join button. A session shows its illustration, a small label and a big countdown, and the
// strip of your session's bars, which draw themselves in when you join and then change in place.

export type Mode = 'join' | 'live';

/** what you did in the session you just finished or left: those minutes are added in on the join screen */
export interface Summary { mins: number; left: boolean }

const reduce = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Stage {
  el: HTMLElement;
  show(mode: Mode, summary?: Summary | null): void;
  readonly mode: Mode;
  /** redraw the strip: on block change, resize, join and leave */
  paint(now: number): void;
  /** every tick */
  tick(now: number): void;
  setInvite(on: boolean): void;
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
  const strip = createStrip();

  // the session's status: a small label and a big countdown
  const word = h('div', { class: 'word', role: 'status', 'aria-live': 'polite' }, '');
  // the countdown is what you look for, so it is the big thing; the state is a small label above it
  const odo = createOdometer('count');
  const live = h('div', { class: 'st-live' }, word, odo.el);
  const title = h('div', { class: 'st-title' }, live);

  const glow = h('span', { class: 'mglow', 'aria-hidden': 'true' });
  strip.el.firstElementChild?.append(glow);
  const card = h('div', { class: 'card st-card' }, strip.el);

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

  function columns(): number {
    return strip.fit((card.clientWidth || 700) - 2 * 28);
  }

  /**
   * Where now sits on the strip during a session: a stretch of the past (grey, with the blocks you
   * were in), then the rest of your session, then the unknown to the end of the strip.
   */
  const TAIL = 2;
  function layout(now: number, total: number): { past: number; future: number } {
    const room = Math.max(0, total - 1 - myAhead(now) - TAIL);
    const past = Math.min(room, Math.floor(total * 0.4));
    return { past, future: total - 1 - past };
  }

  function picture(now: number): Picture {
    const total = columns();
    if (mode === 'live') {
      const { past, future } = layout(now, total);
      const cur = blockIndex(now);
      const head = past + Math.min(1, Math.max(0, (now - blockStartMs(cur)) / BLOCK_MS));
      return {
        total,
        bars: barsOf(myColumns(now, past, future), cur - past),
        head,
        track: head,
        low: myKind(now) === 'break',
        ticks: ticksFrom(blockStartMs(cur - past), total),
      };
    }
    // the join screen has no strip
    return { total, bars: [], head: null, ticks: [] };
  }

  function placeGlow(now: number): void {
    const at = mode === 'live' && myKind(now) === 'final' ? layout(now, columns()).past : null;
    glow.classList.toggle('on', at !== null);
    if (at !== null) glow.style.left = `calc((var(--block-w) + var(--space-2)) * ${at})`;
  }

  const api: Stage = {
    el,
    get mode() { return mode; },
    show(next, summary) {
      mode = next;
      el.dataset.mode = next;
      if (next === 'join') {
        scene.set('idle');
        // the day fills in: all of it when the app opens, just the minutes you added after a session
        const total = opts.todayMins();
        day.show(summary ? Math.max(0, total - summary.mins) : 0, total);
      } else {
        lastLabel = '';
      }
      api.paint(Date.now());
      api.tick(Date.now());
    },
    paint(now) {
      strip.set(picture(now));
      placeGlow(now);
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
      // the play head moves on its own between block changes
      strip.set(picture(now));
      placeGlow(now);
    },
    setInvite(on) { joinBtn.classList.toggle('invite', on); },
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

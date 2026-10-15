import { h, key, topbar } from './dom';
import { createStrip } from './strip';
import { createStates, STATES } from './how';
import type { Col } from './loop';
import { runningText } from './focus';

// One looping animation that explains the three states without words.
const PAT = 'FFFFXBFFFFFFXBB';
const TOTAL = 22; // pattern columns plus hatched unknowns
const DWELL: Record<string, number> = { F: 450, B: 700, X: 1300 };
const kindOf = { F: 'focus', X: 'final', B: 'break' } as const;
const wordOf = { F: 0, X: 1, B: 2 } as const;

function colsAt(i: number): Col[] {
  return Array.from({ length: TOTAL }, (_, j) => {
    if (j > i || j >= PAT.length) return { cell: 'unknown' as const, now: false, t: 0 };
    return { cell: kindOf[PAT[j] as 'F' | 'X' | 'B'], now: j === i, t: 0 };
  });
}

export interface FirstRun {
  el: HTMLElement;
  /** a new session just started and the person is not in it yet */
  setInvite(on: boolean): void;
  togglePanel(force?: boolean): void;
  panelOpen(): boolean;
  /** every tick: what is running right now */
  tick(now: number): void;
  start(): void;
  stop(): void;
}

export function createFirstRun(onJoin: () => void, actionsEl: HTMLElement): FirstRun {
  const strip = createStrip();
  const states = createStates();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const words = STATES.map((s) => h('span', null, s.title));
  const word = h('div', { class: 'word', 'aria-hidden': 'true' }, ...words);
  const live = h('div', { class: 'sr', 'aria-live': 'polite' });
  const sub = h('div', { class: 'sub' }, 'one loop, always running');
  const lanes = h('div', { class: 'lanes', 'aria-hidden': 'true' }, h('span', null, 'focus'), h('span', null, 'break'));
  const card = h('div', { class: 'card' }, h('div', { style: 'position:relative' }, lanes, strip.el));
  const join = h('button', { class: 'btn', onClick: onJoin }, 'join', key('enter'));
  const running = h('div', { class: 'sub running' }, '');
  let runningShown = '';

  const stage = h('main', { class: 'stage' },
    h('div', { class: 'center' }, word, sub, card, states.el, join, running, actionsEl),
  );
  const el = h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' }, topbar(), stage, live);

  let panel = false;
  let timer = 0;
  let i = 0;

  function apply(step: number): void {
    strip.set(colsAt(step));
    const w = wordOf[PAT[Math.min(step, PAT.length - 1)] as 'F' | 'X' | 'B'];
    words.forEach((s, k) => s.classList.toggle('on', k === w));
    states.setActive(panel ? w : -1);
    live.textContent = '';
  }

  function sync(): void {
    sub.style.display = panel ? 'none' : '';
    word.style.display = panel ? 'none' : '';
    states.el.style.display = panel ? '' : 'none';
    card.classList.toggle('compact', panel);
    apply(i);
  }

  function next(): void {
    apply(i);
    const ch = PAT[i];
    const wait = DWELL[ch];
    timer = window.setTimeout(() => {
      i += 1;
      if (i >= PAT.length) {
        timer = window.setTimeout(() => { i = 0; next(); }, 1600);
        return;
      }
      next();
    }, wait);
  }

  const api: FirstRun = {
    el,
    togglePanel(force) {
      panel = force ?? !panel;
      sync();
    },
    setInvite(on) {
      sub.textContent = on ? 'a new session just started' : 'one loop, always running';
      join.classList.toggle('invite', on);
    },
    panelOpen: () => panel,
    tick(now) {
      const text = runningText(now);
      if (text !== runningShown) { running.textContent = text; runningShown = text; }
    },
    start() {
      window.clearTimeout(timer);
      i = reduce ? 5 : 0;
      sync();
      if (!reduce) next();
    },
    stop() {
      window.clearTimeout(timer);
    },
  };
  sync();
  return api;
}

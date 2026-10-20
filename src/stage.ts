import { h, key, topbar } from './dom';
import { BLOCK_MS, blockIndex, blockStartMs, type Kind } from './loop';
import { createScene, type SceneMode } from './scene';
import { barsOf, createStrip, ticksFrom, type Bar, type Picture } from './strip';
import { LABEL, lineAt, runningText } from './focus';
import { myAhead, myColumns, myKind, myTimer } from './me';
import { createOdometer } from './odometer';

// One stage for the whole app. The welcome conversation, the join screen and a running session
// are modes of the same stage: the blocks, the strip's bars, the play head and the text stay on
// screen and move from one picture to the next, so nothing is ever thrown away and redrawn.

export type Mode = 'welcome' | 'join' | 'live';

const INTRO = [
  'One timer. Everyone on it.',
  'Same focus, same breaks, for anyone with this page open.',
  "Send it to your team and you're all on the same beat.",
];

interface Slide {
  lines: string[];
  scene: SceneMode;
  /** the tint while it is shown */
  tint: Kind;
  /** bars relative to the play head's column `c`: [id, cat, from, n] */
  bars: (c: number, total: number) => Bar[];
  head: (c: number) => number;
  glow?: (c: number) => number;
}

// the session picture used by the first and last screen (and the join screen)
const loop = (c: number, total: number): Bar[] => [
  { id: 'p1', cat: 'focus', from: c - 11, n: 6 },
  { id: 'p2', cat: 'break', from: c - 5, n: 2 },
  { id: 'a', cat: 'focus', from: c - 3, n: 7 },
  { id: 'b', cat: 'break', from: c + 4, n: 2 },
  { id: 'u', cat: 'unknown', from: c + 6, n: Math.max(1, Math.min(5, total - c - 6)) },
];
const ahead = (c: number, total: number): Bar[] => [
  { id: 'a', cat: 'focus', from: c - 7, n: 9 },
  { id: 'b', cat: 'break', from: c + 2, n: 2 },
  { id: 'u', cat: 'unknown', from: c + 4, n: Math.max(1, Math.min(5, total - c - 4)) },
];

const SLIDES: Slide[] = [
  { lines: INTRO, scene: 'idle', tint: 'focus', bars: loop, head: (c) => c + 0.4 },
  {
    lines: ['This is focus.', '25 to 50 minutes, and you see how long before you start.', 'Pick one thing that fits. Then do just that.'],
    scene: 'focus', tint: 'focus', bars: ahead, head: (c) => c - 7 + 0.3,
  },
  {
    lines: ['The last five minutes are wrap up.', 'Finish the thought. Leave yourself a note.', 'Then a break of 5 or 10 minutes.'],
    scene: 'final', tint: 'final', bars: ahead, head: (c) => c + 1.4, glow: (c) => c + 1,
  },
  { lines: INTRO, scene: 'idle', tint: 'focus', bars: loop, head: (c) => c + 0.4 },
];
const LAST = SLIDES.length - 1;
const WORD_MS = 70;
const reduce = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Stage {
  el: HTMLElement;
  show(mode: Mode, slide?: number): void;
  readonly mode: Mode;
  /** the welcome screen's own tint, while the welcome is shown */
  tint(): Kind | null;
  next(): void;
  back(): void;
  /** Enter on the welcome: next, or join on the last screen */
  enter(): void;
  /** redraw the strip: on block change, resize, join and leave */
  paint(now: number): void;
  /** every tick */
  tick(now: number): void;
  setInvite(on: boolean): void;
  stop(): void;
}

interface Options {
  join(): void;
  skip(): void;
  /** the leave button and today's bar */
  actions: HTMLElement;
  /** the settings drop-down and how it works */
  menu: HTMLElement;
}

export function createStage(opts: Options): Stage {
  const scene = createScene();
  const strip = createStrip();

  // top right: skip during the welcome, the menu otherwise
  const skip = h('button', { class: 'hint', onClick: () => opts.skip() }, 'skip', key('esc'));
  const right = h('div', { class: 'st-layers st-right' }, h('div', { class: 'st-l st-skip' }, skip), h('div', { class: 'st-l st-menu' }, opts.menu));

  // the words: the welcome's sentences, or the session's status
  const say = h('div', { class: 'st-l st-say' });
  const word = h('div', { class: 'word', role: 'status', 'aria-live': 'polite' }, '');
  const odo = createOdometer('timer');
  const timer = odo.el;
  const line = h('div', { class: 'sub line' }, '');
  const live = h('div', { class: 'st-l st-live' }, word, timer, line);
  const title = h('div', { class: 'st-layers st-title' }, say, live);

  const glow = h('span', { class: 'mglow', 'aria-hidden': 'true' });
  strip.el.firstElementChild?.append(glow);
  const card = h('div', { class: 'card st-card' }, strip.el);

  // the bottom: back, dots and next during the welcome; join or leave and today's bar otherwise
  const dots = SLIDES.map(() => h('i'));
  const back = h('button', { class: 'btn', onClick: () => api.back() }, 'back', key('←')) as HTMLButtonElement;
  const next = h('button', { class: 'btn', onClick: () => api.next() }, 'next', key('→')) as HTMLButtonElement;
  const joinNav = h('button', { class: 'btn primary', onClick: () => opts.join() }, 'join', key('enter'));
  const nav = h('div', { class: 'st-l st-nav' }, back, h('div', { class: 'ob-dots', 'aria-hidden': 'true' }, ...dots), next, joinNav);
  const joinBtn = h('button', { class: 'btn primary', onClick: () => opts.join() }, 'join', key('enter'));
  const running = h('div', { class: 'sub running' }, '');
  const joinArea = h('div', { class: 'st-joinarea' }, joinBtn, running);
  const act = h('div', { class: 'st-l st-act' }, joinArea, opts.actions);
  const foot = h('div', { class: 'st-layers st-foot' }, nav, act);

  const el = h('div', { class: 'st', 'data-mode': 'join' },
    topbar(right),
    h('main', { class: 'st-main' }, scene.el, title, card, foot),
  );

  let mode: Mode = 'join';
  let slide = LAST;
  let sayShown = -1;
  let sayTimer = 0;
  let lastLabel = '';
  let lastLine = '';
  let lastTimer = '';
  let lastRunning = '';
  let wordSwap = 0;
  let lineSwap = 0;

  /** the sentences come out of a blur one word at a time; the old ones blur away first */
  function sayLines(k: number): void {
    if (sayShown === k) return;
    const fresh = sayShown === -1 || !say.children.length;
    sayShown = k;
    window.clearTimeout(sayTimer);
    const fill = (): void => {
      say.classList.remove('go', 'leaving');
      let t = reduce() ? 0 : 120;
      say.replaceChildren(...SLIDES[k].lines.map((text, idx) => {
        const row = h('div', { class: idx === 0 ? 'l lead' : 'l' });
        text.split(' ').forEach((part, n) => {
          if (n) row.append(' ');
          row.append(h('span', { class: 'w', style: `--d:${t}ms` }, part));
          t += WORD_MS;
        });
        t += 260;
        return row;
      }));
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => say.classList.add('go')));
    };
    if (fresh) fill();
    else { say.classList.add('leaving'); sayTimer = window.setTimeout(fill, 260); }
  }

  function columns(): number {
    return strip.fit((card.clientWidth || 700) - 2 * 28);
  }

  function picture(now: number): Picture {
    const total = columns();
    if (mode === 'live') {
      const future = Math.min(Math.max(3, myAhead(now) + 2), Math.floor(total / 2));
      const past = total - 1 - future;
      const cols = myColumns(now, past, future);
      const cur = blockIndex(now);
      const frac = Math.min(1, Math.max(0, (now - blockStartMs(cur)) / BLOCK_MS));
      const kind = myKind(now);
      return {
        total,
        bars: barsOf(cols, cur - past),
        head: past + frac,
        low: kind === 'break',
        ticks: ticksFrom(blockStartMs(cur - past), total),
      };
    }
    // the welcome pictures (and the join screen) sit around now, on the same ruler
    const c = total - 1 - 8;
    const s = SLIDES[mode === 'join' ? LAST : slide];
    const bars = s.bars(c, total).filter((b) => b.from + b.n > 0).map((b) => (b.from < 0 ? { ...b, n: b.n + b.from, from: 0 } : b));
    return { total, bars, head: s.head(c), ticks: ticksFrom(blockStartMs(blockIndex(now) - c), total) };
  }

  function placeGlow(now: number): void {
    const total = columns();
    let at: number | null = null;
    if (mode === 'welcome' && SLIDES[slide].glow) at = SLIDES[slide].glow!(total - 1 - 8);
    if (mode === 'live' && myKind(now) === 'final') {
      const future = Math.min(Math.max(3, myAhead(now) + 2), Math.floor(total / 2));
      at = total - 1 - future;
    }
    glow.classList.toggle('on', at !== null);
    if (at !== null) glow.style.left = `calc((var(--block-w) + var(--space-2)) * ${at})`;
  }

  /** joining: the scene's blocks drop into the strip and land on the start of your session */
  function flyIn(now: number): void {
    if (reduce()) return;
    const a = picture(now).bars.find((b) => b.id === 'a');
    const lane = strip.el.firstElementChild as HTMLElement | null;
    if (!a || !lane) return;
    const cs = getComputedStyle(document.documentElement);
    const w = parseFloat(cs.getPropertyValue('--block-w')) || 20;
    const gap = parseFloat(cs.getPropertyValue('--space-2')) || 5;
    const box = lane.getBoundingClientRect();
    const blocks = [...scene.el.children] as HTMLElement[];
    scene.el.style.opacity = '0';
    blocks.forEach((b, k) => {
      const r = b.getBoundingClientRect();
      const fly = h('i', { class: 'fly', style: `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;background:${getComputedStyle(b).backgroundColor}` });
      document.body.append(fly);
      const col = a.from + Math.min(k, a.n - 1);
      const dx = box.left + col * (w + gap) - r.left;
      const dy = box.top - r.top;
      fly.animate([
        { transform: 'translate(0,0) rotate(0)', background: getComputedStyle(b).backgroundColor },
        { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 30}px) rotate(${k % 2 ? 18 : -18}deg)`, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) rotate(0)`, background: 'var(--ink)' },
      ], { duration: 700, delay: k * 55, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' })
        .finished.then(() => fly.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).finished)
        .then(() => fly.remove(), () => fly.remove());
    });
    window.setTimeout(() => { scene.el.style.opacity = ''; }, 1000);
  }

  const api: Stage = {
    el,
    get mode() { return mode; },
    tint: () => (mode === 'welcome' ? SLIDES[slide].tint : null),
    show(next, k) {
      const joining = next === 'live' && mode !== 'live';
      mode = next;
      el.dataset.mode = next;
      if (next === 'welcome') slide = k ?? 0;
      if (next !== 'live') sayLines(next === 'join' ? LAST : slide);
      if (next === 'welcome') {
        dots.forEach((d, n) => d.classList.toggle('on', n === slide));
        back.disabled = slide === 0;
        nav.classList.toggle('last', slide === LAST);
        scene.set(SLIDES[slide].scene);
      } else if (next === 'join') {
        scene.set('idle');
      } else {
        lastLabel = '';
        lastLine = '';
      }
      if (joining) flyIn(Date.now());
      api.paint(Date.now());
      api.tick(Date.now());
    },
    next() { if (mode === 'welcome' && slide < LAST) api.show('welcome', slide + 1); },
    back() { if (mode === 'welcome' && slide > 0) api.show('welcome', slide - 1); },
    enter() { if (slide < LAST) api.next(); else opts.join(); },
    paint(now) {
      strip.set(picture(now));
      placeGlow(now);
    },
    tick(now) {
      if (mode === 'live') {
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
        const b = blockIndex(now);
        const text = lineAt(now, kind, b, blockStartMs(b));
        if (text !== lastLine) {
          const first = lastLine === '';
          lastLine = text;
          window.clearTimeout(lineSwap);
          line.style.opacity = '0';
          lineSwap = window.setTimeout(() => { line.textContent = text; line.style.opacity = '1'; }, first ? 0 : 450);
        }
        const t = myTimer(now);
        if (t !== lastTimer) { odo.set(t); lastTimer = t; }
        // the play head moves on its own between block changes
        strip.set(picture(now));
        placeGlow(now);
      } else if (mode === 'join') {
        const r = runningText(now);
        if (r !== lastRunning) { running.textContent = r; lastRunning = r; }
      }
    },
    setInvite(on) { joinBtn.classList.toggle('invite', on); joinNav.classList.toggle('invite', on); },
    stop() { scene.stop(); },
  };
  return api;
}

import { h, topbar } from './dom';
import { createStrip } from './strip';
import { blockIndex, blockStartMs, sessionEndMs, sessionStartMs, stateAt, type Kind } from './loop';
import { fmtElapsed } from './format';
import { createScene } from './scene';
import { myAhead, myColumns, myKind, myTimer } from './me';

export interface Focus {
  el: HTMLElement;
  /** called every tick */
  tick(now: number): void;
  /** rebuild the strip, call on block change and resize */
  paint(now: number): void;
  /** stop the animation, before the screen is thrown away */
  stop(): void;
}

/** focus and wrap up count up from the session start, a break counts down to its end */
export function timerText(now: number, kind: Kind): string {
  return kind === 'break'
    ? `${fmtElapsed(Math.ceil((sessionEndMs(now) - now) / 1000) * 1000)} left`
    : `${fmtElapsed(now - sessionStartMs(now))} in`;
}

/** what is running right now, for people who have not joined: "focus · 12:34 in" */
export function runningText(now: number): string {
  const kind = stateAt(now).kind;
  return `${LABEL[kind]} · ${timerText(now, kind)}`;
}

export const LABEL = { focus: 'focus', final: 'wrap up', break: 'break' } as const;

// One quiet line under the status says what to do. Mostly the same line, so it becomes familiar;
// about one block in five opens with a different one for its first minute.
export const USUAL: Record<Kind, string> = {
  focus: 'one thing. go.',
  final: 'leave it where you can find it.',
  break: 'the blocks are off duty. so are you.',
};
const RARE: Record<Kind, string[]> = {
  focus: [
    "the tab you're about to open can wait.",
    'your inbox survived without you before.',
    "nobody's watching. that's the point.",
    "if you're reading this, you're not working.",
  ],
  final: ['write the next step down. future you is forgetful.', 'save. then save again.', 'land the plane.'],
  break: ['stand up. the chair will wait.', 'water. not coffee. fine, coffee.', 'look at something far away. not a screen.'],
};
const RARE_MS = 60_000;

/** the line for this moment: the usual one, or now and then a surprise */
export function lineAt(now: number, kind: Kind, block: number, blockStart: number): string {
  const hash = Math.imul(block, 2654435761) >>> 0;
  if (hash % 5 === 0 && now - blockStart < RARE_MS) return RARE[kind][(hash >>> 8) % RARE[kind].length];
  return USUAL[kind];
}

export function createFocus(actionsEl: HTMLElement, menuEl: HTMLElement): Focus {
  const strip = createStrip({ live: true });
  const card = h('div', { class: 'card' }, strip.el);

  const scene = createScene();
  const status = h('div', { class: 'word', role: 'status', 'aria-live': 'polite' }, '');
  const timer = h('div', { class: 'timer' }, '');
  const line = h('div', { class: 'sub line' }, '');
  const head = h('div', { class: 'head' }, scene.el, status, timer, line);
  const el = h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' },
    topbar(menuEl),
    h('main', { class: 'stage' }, head, card, actionsEl),
  );

  let lastLabel = '';
  let lastLine = '';
  let lastTimer = '';
  let swap = 0;
  let wordSwap = 0;
  const api: Focus = {
    el,
    paint(now) {
      const width = card.clientWidth - 2 * 28 || 600;
      const total = strip.fit(width);
      // the rest of your session ahead, plus a little of what comes after, never more than half the strip
      const future = Math.min(Math.max(3, myAhead(now) + 2), Math.floor(total / 2));
      strip.set(myColumns(now, total - 1 - future, future));
      strip.tick(now);
    },
    tick(now) {
      // everything here is your own schedule (see me.ts), not necessarily the shared one
      const s = { kind: myKind(now), block: blockIndex(now) };
      const label = LABEL[s.kind];
      scene.set(s.kind);
      if (label !== lastLabel) {
        // the old word blurs away and the new one comes into focus
        const first = lastLabel === '';
        lastLabel = label;
        window.clearTimeout(wordSwap);
        status.classList.add('out');
        wordSwap = window.setTimeout(() => { status.textContent = label; status.classList.remove('out'); }, first ? 0 : 450);
      }
      const next = lineAt(now, s.kind, s.block, blockStartMs(s.block));
      if (next !== lastLine) {
        const first = lastLine === '';
        lastLine = next;
        window.clearTimeout(swap);
        line.style.opacity = '0';
        swap = window.setTimeout(() => { line.textContent = next; line.style.opacity = '1'; }, first ? 0 : 450);
      }
      const text = myTimer(now);
      if (text !== lastTimer) { timer.textContent = text; lastTimer = text; }
      strip.tick(now);
    },
    stop() { scene.stop(); },
  };
  return api;
}

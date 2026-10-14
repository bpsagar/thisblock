import { h, topbar } from './dom';
import { createStrip } from './strip';
import { columns, stateAt, type Kind } from './loop';

export interface Focus {
  el: HTMLElement;
  /** called every tick */
  tick(now: number): void;
  /** rebuild the strip, call on block change and resize */
  paint(now: number): void;
}

export const LABEL = { focus: 'focus', final: 'wrap up', break: 'break' } as const;

// One quiet line under the status says what to do. It rotates so the screen is never static.
export const LINES: Record<Kind, string[]> = {
  focus: ['pick one task', 'stay on it', 'notifications off'],
  final: ['finish the thought', 'note where you stopped', 'save your work'],
  break: ['reset', 'drink some water', 'take a walk'],
};
export const ROTATE_MS = 12000;

export function createFocus(actionsEl: HTMLElement): Focus {
  const strip = createStrip({ live: true });
  const card = h('div', { class: 'card' }, strip.el);

  const status = h('div', { class: 'word', role: 'status', 'aria-live': 'polite' }, 'focus');
  const line = h('div', { class: 'sub line' }, '');
  const head = h('div', { class: 'head' }, status, line);
  const el = h('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' },
    topbar(),
    h('main', { class: 'stage' }, head, card, actionsEl),
  );

  let lastLabel = '';
  let lastLine = '';
  let swap = 0;
  const api: Focus = {
    el,
    paint(now) {
      const width = card.clientWidth - 2 * 28 || 600;
      const total = strip.fit(width);
      const future = Math.min(7, Math.floor(total / 3));
      strip.set(columns(now, total - 1 - future, future));
      strip.tick(now);
    },
    tick(now) {
      const s = stateAt(now);
      const label = LABEL[s.kind];
      if (label !== lastLabel) { status.textContent = label; lastLabel = label; }
      const lines = LINES[s.kind];
      const next = lines[Math.floor(now / ROTATE_MS) % lines.length];
      if (next !== lastLine) {
        const first = lastLine === '';
        lastLine = next;
        window.clearTimeout(swap);
        line.style.opacity = '0';
        swap = window.setTimeout(() => { line.textContent = next; line.style.opacity = '1'; }, first ? 0 : 280);
      }
      strip.tick(now);
    },
  };
  return api;
}

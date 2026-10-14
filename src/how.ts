import { h } from './dom';

export const STATES = [
  { id: 'focus', title: 'focus', meta: '25 to 50 min', lines: ['pick one task', 'stay on it', 'notifications off'], glyph: [true, false] },
  { id: 'wrap up', title: 'wrap up', meta: 'the last 5 min', lines: ['finish the thought', 'note where you stopped', 'save your work'], glyph: [true, false] },
  { id: 'break', title: 'break', meta: '5 or 10 min', lines: ['reset', 'drink some water', 'take a walk'], glyph: [false, true] },
] as const;

export interface States {
  el: HTMLElement;
  /** -1 lights nothing */
  setActive(i: number): void;
}

export function createStates(): States {
  const cols = STATES.map((s) =>
    h('div', { class: 'state' },
      h('div', { class: 'glyph', 'aria-hidden': 'true' }, h('i', { class: s.glyph[0] ? 'on' : '' }), h('i', { class: s.glyph[1] ? 'on' : '' })),
      h('h3', null, s.title),
      h('div', { class: 'meta' }, s.meta),
      h('ul', null, ...s.lines.map((l) => h('li', null, l))),
    ),
  );
  const el = h('div', { class: 'states' }, ...cols);
  return {
    el,
    setActive(i) {
      cols.forEach((c, k) => c.classList.toggle('active', k === i));
    },
  };
}

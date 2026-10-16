import { h, key } from './dom';
import { store, dayKey } from './store';
import { BLOCK_MS } from './loop';
import { fmtShort } from './format';

export interface Action { label: string; key: string; run(): void }

/** minutes of focus completed today */
export const todayMins = (): number => (store.log[dayKey(new Date())] ?? 0) * (BLOCK_MS / 60000);

/**
 * The one number (minutes today) and the quiet row of actions, each with its keyboard shortcut.
 * Everything that used to live in the command palette is here.
 */
export function createActions(
  items: () => Action[],
  live: () => number = () => 0,
): { el: HTMLElement; refresh(): void; tick(): void } {
  const bar = h('div', { class: 'daybar', role: 'img' });
  const label = h('div', { class: 'daytext' });
  const today = h('div', { class: 'today' }, bar, label);
  const row = h('nav', { class: 'acts', 'aria-label': 'Actions' });
  const el = h('div', { class: 'actions' }, today, row);
  const MIN_SEGS = 48; // four hours; the bar grows by whole hours past that
  let shown = '';
  let segs: HTMLElement[] = [];
  /** the day as one bar of 5 minute segments, the running block filling up; only touches the DOM when it changes */
  function paintToday(): void {
    const running = live();
    const total = todayMins() + running;
    const n = String(total);
    if (n === shown) return;
    shown = n;
    const blocks = Math.floor(total / 5);
    const count = Math.max(MIN_SEGS, Math.ceil((blocks + 1) / 12) * 12);
    if (segs.length !== count) {
      segs = Array.from({ length: count }, (_, i) => h('i', { class: i > 0 && i % 12 === 0 ? 'h' : '' }));
      bar.replaceChildren(...segs);
    }
    segs.forEach((seg, i) => {
      seg.className = (i > 0 && i % 12 === 0 ? 'h ' : '') + (i < blocks ? 'on' : i === blocks && total % 5 > 0 ? 'run' : '');
      if (i === blocks) seg.style.setProperty('--f', String((total % 5) / 5));
    });
    bar.setAttribute('aria-label', `${fmtShort(total)} of focus today`);
    label.replaceChildren(h('b', null, fmtShort(total)), ' today');
  }
  function refresh(): void {
    paintToday();
    row.replaceChildren(...items().map((a) => h('button', { class: 'hint', onClick: a.run }, a.label, key(a.key))));
  }
  refresh();
  return { el, refresh, tick: paintToday };
}

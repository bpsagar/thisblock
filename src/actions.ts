import { h, key } from './dom';
import { store, dayKey } from './store';
import { BLOCK_MS } from './loop';

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
  const today = h('div', { class: 'today' });
  const row = h('nav', { class: 'acts', 'aria-label': 'Actions' });
  const el = h('div', { class: 'actions' }, today, row);
  let shown = '';
  /** minutes today including the running block; only touches the DOM when the number changes */
  function paintToday(): void {
    const n = String(todayMins() + live());
    if (n === shown) return;
    shown = n;
    today.replaceChildren(h('b', null, n), ' min today');
  }
  function refresh(): void {
    paintToday();
    row.replaceChildren(...items().map((a) => h('button', { class: 'hint', onClick: a.run }, a.label, key(a.key))));
  }
  refresh();
  return { el, refresh, tick: paintToday };
}

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
export function createActions(items: () => Action[]): { el: HTMLElement; refresh(): void } {
  const today = h('div', { class: 'today' });
  const row = h('nav', { class: 'acts', 'aria-label': 'Actions' });
  const el = h('div', { class: 'actions' }, today, row);
  function refresh(): void {
    today.replaceChildren(h('b', null, String(todayMins())), ' min today');
    row.replaceChildren(...items().map((a) => h('button', { class: 'hint', onClick: a.run }, a.label, key(a.key))));
  }
  refresh();
  return { el, refresh };
}

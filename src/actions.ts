import { h, key } from './dom';
import { store, dayKey } from './store';
import { BLOCK_MS } from './loop';
import { fmtShort } from './format';

export interface Action { label: string; key: string; run(): void }

/** minutes of focus completed today */
export const todayMins = (): number => (store.log[dayKey(new Date())] ?? 0) * (BLOCK_MS / 60000);

export interface Actions {
  /** the leave button (when you are in) and today's bar */
  el: HTMLElement;
  /** the settings drop-down for the top bar */
  menu: HTMLElement;
  refresh(): void;
  tick(): void;
}

/**
 * Today's bar, the leave button, and a settings drop-down that holds every other action
 * with its keyboard shortcut. `items` lists all actions, the one with key `l` is leave.
 */
export function createActions(items: () => Action[], live: () => number = () => 0): Actions {
  const bar = h('div', { class: 'daybar', role: 'img' });
  const label = h('div', { class: 'daytext' });
  const today = h('div', { class: 'today' }, bar, label);
  const leaveSlot = h('div', { class: 'leave-slot' });
  const el = h('div', { class: 'actions' }, leaveSlot, today);

  // settings drop-down
  const list = h('div', { class: 'menu-list', role: 'menu' });
  const toggle = h('button', { class: 'hint', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onClick: () => setOpen(!menu.classList.contains('open')) }, 'settings', h('span', { class: 'caret', 'aria-hidden': 'true' }, '▾'));
  const menu = h('div', { class: 'menu' }, toggle, list);
  function setOpen(on: boolean): void {
    menu.classList.toggle('open', on);
    toggle.setAttribute('aria-expanded', String(on));
  }
  document.addEventListener('pointerdown', (e) => { if (menu.isConnected && !menu.contains(e.target as Node)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { e.stopPropagation(); setOpen(false); } }, true);
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
    const all = items();
    const leave = all.find((a) => a.key === 'l');
    leaveSlot.replaceChildren(...(leave ? [h('button', { class: 'btn primary', onClick: leave.run }, leave.label, key(leave.key))] : []));
    list.replaceChildren(...all.filter((a) => a !== leave).map((a) =>
      h('button', { class: 'menu-item', role: 'menuitem', onClick: () => { setOpen(false); a.run(); } }, a.label, key(a.key))));
  }
  refresh();
  return { el, menu, refresh, tick: paintToday };
}

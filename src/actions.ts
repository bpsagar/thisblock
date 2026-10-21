import { h, key } from './dom';
import { store, dayKey } from './store';
import { BLOCK_MS } from './day';
import { fmtShort } from './format';

export interface Action { label: string; key: string; run(): void; /** shows a checkbox, ticked when on */ checked?: boolean; /** a divider above this item */ divider?: boolean }

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
  const right = h('div', { class: 'topright' }, menu);
  function setOpen(on: boolean): void {
    menu.classList.toggle('open', on);
    toggle.setAttribute('aria-expanded', String(on));
  }
  document.addEventListener('pointerdown', (e) => { if (menu.isConnected && !menu.contains(e.target as Node)) setOpen(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('open')) { e.stopPropagation(); setOpen(false); } }, true);
  const MIN_SEGS = 48; // four hours; the bar grows by whole hours past that
  let shown = '';
  let segs: HTMLElement[] = [];
  let lastBlocks = -1;
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
    // a block that just counted pops; finishing an hour sends a ripple across that hour
    if (lastBlocks >= 0 && blocks > lastBlocks && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const seg = segs[blocks - 1];
      seg?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.9,2.2)' }, { transform: 'scale(.9)' }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.3,1.6,.5,1)' });
      if (blocks % 12 === 0) {
        for (let k = 0; k < 12; k++) segs[blocks - 12 + k]?.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(2)' }, { transform: 'scaleY(1)' }], { duration: 420, delay: 300 + k * 45, easing: 'ease-out' });
      }
    }
    lastBlocks = blocks;
    bar.setAttribute('aria-label', `${fmtShort(total)} of focus today`);
    label.replaceChildren(h('b', null, fmtShort(total)), ' today');
  }
  function refresh(): void {
    paintToday();
    const all = items();
    const leave = all.find((a) => a.key === 'l');
    leaveSlot.replaceChildren(...(leave ? [h('button', { class: 'btn primary', onClick: leave.run }, leave.label, key(leave.key))] : []));
    const rows = all.filter((a) => a !== leave);
    list.replaceChildren(...rows.flatMap((a, idx) => [
      ...(a.divider && idx > 0 ? [h('div', { class: 'menu-divider', role: 'separator' })] : []),
      h('button', { class: 'menu-item', role: a.checked === undefined ? 'menuitem' : 'menuitemcheckbox', 'aria-checked': a.checked === undefined ? false : String(a.checked), onClick: () => { setOpen(false); a.run(); } },
        h('span', { class: 'mi-l' }, a.checked === undefined ? null : h('span', { class: `check${a.checked ? ' on' : ''}`, 'aria-hidden': 'true' }, ''), a.label),
        key(a.key)),
    ]));
  }
  refresh();
  return { el, menu: right, refresh, tick: paintToday };
}

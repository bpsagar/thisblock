import { h } from './dom';

// A countdown where only the digits that change roll, like a mechanical counter.
// Each digit is a reel 0..9 with an extra 0 at the end, so 0 to 9 (counting down) and
// 9 to 0 (counting up) roll the short way round instead of spinning back.

export interface Odometer { el: HTMLElement; set(text: string): void }

const reduce = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createOdometer(className = ''): Odometer {
  const el = h('div', { class: `odo ${className}`.trim(), role: 'timer' });
  let mask = '';
  let reels: { reel: HTMLElement; v: number }[] = [];

  function build(text: string): void {
    reels = [];
    el.replaceChildren(...[...text].map((ch) => {
      if (!/\d/.test(ch)) return h('span', { class: 'odo-c', 'aria-hidden': 'true' }, ch);
      const reel = h('span', { class: 'odo-reel' }, ...Array.from({ length: 11 }, (_, i) => h('span', null, String(i % 10))));
      const r = { reel, v: Number(ch) };
      reel.style.transform = `translateY(${-r.v * (100 / 11)}%)`;
      reels.push(r);
      return h('span', { class: 'odo-d', 'aria-hidden': 'true' }, reel);
    }));
  }

  function roll(r: { reel: HTMLElement; v: number }, v: number): void {
    if (r.v === v) return;
    const s = r.reel.style;
    const to = (i: number): void => { s.transform = `translateY(${-i * (100 / 11)}%)`; };
    if (reduce()) { s.transition = 'none'; to(v); r.v = v; return; }
    if (r.v === 0 && v === 9) {
      // counting down past 0: jump to the spare 0 at the bottom, then roll up to 9
      s.transition = 'none';
      to(10);
      void r.reel.offsetHeight;
      s.transition = '';
    } else if (r.v === 9 && v === 0) {
      // counting up past 9: roll to the spare 0, then quietly reset to the top one
      to(10);
      r.v = 0;
      window.setTimeout(() => { if (r.v === 0) { s.transition = 'none'; to(0); void r.reel.offsetHeight; s.transition = ''; } }, 400);
      return;
    }
    to(v);
    r.v = v;
  }

  return {
    el,
    set(text) {
      el.setAttribute('aria-label', text);
      const next = [...text].map((c) => (/\d/.test(c) ? '0' : c)).join('');
      if (next !== mask) { mask = next; build(text); return; }
      let k = 0;
      for (const ch of text) if (/\d/.test(ch)) roll(reels[k++], Number(ch));
    },
  };
}

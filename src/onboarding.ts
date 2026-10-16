import { h, key, topbar } from './dom';

// A short conversation shown to people who have not joined before.
// Each screen types itself in word by word out of a blur, then shows a small picture.
// The last screen is the first one again, with the join button, so it reads as a loop.

const INTRO = [
  'One global focus and break timer.',
  'Everyone on this site is in the same synchronized focus and breaks.',
  'Share it with your coworkers, so you all focus and rest at the same time.',
];
const WORD_MS = 70;
const reduce = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

type Cell = 'focus' | 'final' | 'break' | 'unknown';
const col = (cell: Cell, now = false): HTMLElement =>
  cell === 'unknown'
    ? h('div', { class: 'col unknown', style: 'min-height:calc(var(--block-h) * 2 + var(--space-1))' })
    : h('div', { class: `col ${cell}${now ? ' now' : ''}` }, h('i', { class: 't' }), h('i', { class: 'b' }));
const strip = (cells: (Cell | [Cell, true])[]): HTMLElement =>
  h('div', { class: 'ob-card' }, h('div', { class: 'strip' }, ...cells.map((c) => (Array.isArray(c) ? col(c[0], true) : col(c)))));
const rep = <T>(v: T, n: number): T[] => Array.from({ length: n }, () => v);

interface Slide { lines: string[]; picture(): HTMLElement[] }

export interface Onboarding {
  el: HTMLElement;
  next(): void;
  back(): void;
  /** Enter: next, or join on the last screen */
  enter(): void;
  skip(): void;
}

export function createOnboarding(onJoin: () => void, onSkip: () => void): Onboarding {
  const loopStrip = (): HTMLElement =>
    strip([...rep<Cell>('focus', 4), 'final', 'break', 'break', ...rep<Cell>('focus', 3), ['focus', true], ...rep<Cell>('unknown', 6)]);

  const slides: Slide[] = [
    { lines: INTRO, picture: () => [loopStrip()] },
    {
      lines: [
        'This is a focus block.',
        'A session is 25 to 50 minutes of focus, and you never know exactly when it ends.',
        'That is the point. Pick one task and just get started.',
      ],
      picture: () => [
        strip([...rep<Cell>('focus', 4), ['focus', true], ...rep<Cell>('unknown', 6)]),
        h('div', { class: 'cap' }, 'started', h('span', { class: 'gap' }), '25 to 50 min, hidden', h('span', { class: 'gap' }), '?'),
      ],
    },
    {
      lines: [
        'When a block turns orange,',
        'the session ends in the next 5 minutes. Wrap up.',
        'Then comes a break of 5 to 10 minutes. It is a surprise too.',
      ],
      picture: () => [
        strip([...rep<Cell>('focus', 5), ['final', true], 'break', 'break', ...rep<Cell>('unknown', 3)]),
        h('div', { class: 'cap' }, h('b', { class: 'orange' }, 'orange'), ' = last 5 minutes · the grey row is the break'),
      ],
    },
    {
      lines: INTRO,
      picture: () => [loopStrip(), h('button', { class: 'btn primary', onClick: onJoin }, 'join', key('enter'))],
    },
  ];

  const say = h('div', { class: 'ob-say' });
  const pic = h('div', { class: 'ob-pic' });
  const dots = slides.map(() => h('i'));
  const back = h('button', { class: 'btn', onClick: () => api.back() }, 'back', key('←'));
  const next = h('button', { class: 'btn', onClick: () => api.next() }, 'next', key('→'));
  const el = h('div', { class: 'ob' },
    topbar(h('button', { class: 'hint', onClick: () => api.skip() }, 'skip', key('esc'))),
    h('main', null, say, pic),
    h('div', { class: 'ob-foot' }, back, h('div', { class: 'ob-dots', 'aria-hidden': 'true' }, ...dots), next),
  );
  let i = 0;
  let raf = 0;

  function words(text: string, start: number): [DocumentFragment, number] {
    const frag = document.createDocumentFragment();
    let n = 0;
    for (const part of text.split(' ')) {
      if (n > 0) frag.append(' ');
      const w = h('span', { class: 'w', style: `--d:${start + n * WORD_MS}ms` }, part);
      frag.append(w);
      n += 1;
    }
    return [frag, start + n * WORD_MS];
  }

  function show(k: number): void {
    i = k;
    el.classList.remove('go');
    const s = slides[k];
    let t = reduce() ? 0 : 120;
    say.replaceChildren(
      ...s.lines.map((line, idx) => {
        const [frag, end] = words(line, t);
        t = end + 260;
        return h('div', { class: idx === 0 ? 'l lead' : 'l' }, frag);
      }),
    );
    pic.style.setProperty('--vd', `${t}ms`);
    pic.replaceChildren(...s.picture());
    dots.forEach((d, n) => d.classList.toggle('on', n === k));
    (back as HTMLButtonElement).disabled = k === 0;
    (next as HTMLButtonElement).disabled = k === slides.length - 1;
    document.title = 'thisblock';
    window.cancelAnimationFrame(raf);
    raf = window.requestAnimationFrame(() => { raf = window.requestAnimationFrame(() => el.classList.add('go')); });
  }

  const api: Onboarding = {
    el,
    next() { if (i < slides.length - 1) show(i + 1); },
    back() { if (i > 0) show(i - 1); },
    enter() { if (i < slides.length - 1) show(i + 1); else onJoin(); },
    skip: onSkip,
  };
  show(0);
  return api;
}

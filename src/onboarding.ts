import { h, key, topbar } from './dom';
import { runningText } from './focus';

// A short conversation shown to people who have not joined before.
// Each screen types itself in word by word out of a blur, then shows a small picture.
// The last screen is the first one again, with the join button, so it reads as a loop.

const INTRO = [
  'One timer. Everyone on it.',
  'Same focus, same breaks, for anyone with this page open.',
  "Send it to your team and you're all on the same beat.",
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
  /** a new session just started and the person is not in it yet */
  setInvite(on: boolean): void;
  /** every tick: what is running right now (join screen only) */
  tick(now: number): void;
}

interface Options {
  join(): void;
  /** the full conversation (new people), or just its last screen (everyone else) */
  full: boolean;
  skip(): void;
  /** the row of actions, shown under the join button on the last screen only */
  actions?: HTMLElement;
  /** the settings drop-down for the top bar, join screen only */
  menu?: HTMLElement;
}

export function createOnboarding(opts: Options): Onboarding {
  const onJoin = opts.join;
  const loopStrip = (): HTMLElement =>
    strip([...rep<Cell>('focus', 4), 'final', 'break', 'break', ...rep<Cell>('focus', 3), ['focus', true], ...rep<Cell>('unknown', 6)]);

  const joinBtn = h('button', { class: 'btn primary', onClick: onJoin }, 'join', key('enter'));
  const running = h('div', { class: 'sub running' }, '');
  let runningShown = '';

  const slides: Slide[] = [
    { lines: INTRO, picture: () => [loopStrip()] },
    {
      lines: [
        'This is focus.',
        "25 to 50 minutes. You won't know which. That's on purpose.",
        'Not knowing when it ends is a great reason to start now.',
      ],
      picture: () => [strip([...rep<Cell>('focus', 4), ['focus', true], ...rep<Cell>('unknown', 6)])],
    },
    {
      lines: [
        'Orange means wrap up.',
        'Five minutes left. Leave yourself a note.',
        "Then a break of 5 or 10 minutes. Also a surprise. We're consistent like that.",
      ],
      picture: () => [
        strip([...rep<Cell>('focus', 5), ['final', true], 'break', 'break', ...rep<Cell>('unknown', 3)]),
        h('div', { class: 'cap' }, h('b', { class: 'orange' }, 'orange'), ' = last 5 minutes · the grey row is the break'),
      ],
    },
    {
      lines: INTRO,
      picture: () => [loopStrip(), joinBtn, ...(opts.full ? [] : [running]), ...(opts.actions && !opts.full ? [opts.actions] : [])],
    },
  ];

  const say = h('div', { class: 'ob-say' });
  const pic = h('div', { class: 'ob-pic' });
  const dots = slides.map(() => h('i'));
  const back = h('button', { class: 'btn', onClick: () => api.back() }, 'back', key('←'));
  const next = h('button', { class: 'btn', onClick: () => api.next() }, 'next', key('→'));
  const el = h('div', { class: 'ob' },
    topbar(opts.full ? h('button', { class: 'hint', onClick: () => api.skip() }, 'skip', key('esc')) : opts.menu ?? null),
    h('main', null, say, pic),
    opts.full ? h('div', { class: 'ob-foot' }, back, h('div', { class: 'ob-dots', 'aria-hidden': 'true' }, ...dots), next) : null,
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
    skip: opts.skip,
    setInvite(on) { joinBtn.classList.toggle('invite', on); },
    tick(now) {
      const text = runningText(now);
      if (text !== runningShown) { running.textContent = text; runningShown = text; }
    },
  };
  show(opts.full ? 0 : slides.length - 1);
  api.tick(Date.now());
  return api;
}

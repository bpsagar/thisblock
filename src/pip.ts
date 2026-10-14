import { h, key } from './dom';
import { createStrip } from './strip';
import { columns, stateAt } from './loop';
import { LABEL, LINES, ROTATE_MS } from './focus';

// A small always-on-top window with the loop in it.
// Chrome and Edge (desktop, also as an installed app) can open a real HTML window: Document Picture-in-Picture.
// Safari has no such window, so there the same view is drawn on a canvas and shown as a video in picture-in-picture.
// Firefox has neither, so the command is hidden there.

export interface PipHost {
  isJoined(): boolean;
  join(): void;
  /** the first block of a new session, for someone who was in the last one */
  invite(): boolean;
  theme(): 'light' | 'dark';
  /** the mini window was closed by the person */
  closed(): void;
}

export interface Pip {
  readonly supported: boolean;
  isOpen(): boolean;
  toggle(): Promise<void>;
  /** every second */
  tick(now: number): void;
  /** on block change, session change, join, leave and theme change */
  refresh(now: number): void;
}

interface DocPipApi { requestWindow(o?: Record<string, unknown>): Promise<Window>; window: Window | null }
const docApi = (): DocPipApi | undefined => (window as unknown as { documentPictureInPicture?: DocPipApi }).documentPictureInPicture;
const videoOk = (): boolean =>
  !!document.pictureInPictureEnabled && typeof HTMLVideoElement !== 'undefined' && 'requestPictureInPicture' in HTMLVideoElement.prototype;

const W = 360;
const H = 190;

/* ---------- window version: the same components as the app ---------- */

function createMiniView(host: PipHost, width: () => number) {
  const strip = createStrip({ live: true });
  const word = h('div', { class: 'word', role: 'status' }, '');
  const line = h('div', { class: 'sub line' }, '');
  const join = h('button', { class: 'btn', onClick: () => host.join() }, 'join', key('enter'));
  const el = h('div', { class: 'mini' }, word, line, strip.el, join);
  let joined: boolean | null = null;

  const paint = (now: number): void => {
    if (!host.isJoined()) return;
    const total = strip.fit(width());
    const future = Math.min(5, Math.floor(total / 3));
    strip.set(columns(now, total - 1 - future, future));
    strip.tick(now);
  };

  function update(now: number): void {
    const on = host.isJoined();
    const changed = on !== joined;
    joined = on;
    strip.el.style.display = on ? '' : 'none';
    join.style.display = on ? 'none' : '';
    join.classList.toggle('invite', host.invite());
    if (on) {
      const s = stateAt(now);
      word.textContent = LABEL[s.kind];
      const lines = LINES[s.kind];
      line.textContent = lines[Math.floor(now / ROTATE_MS) % lines.length];
      if (changed) paint(now);
      strip.tick(now);
    } else {
      word.textContent = 'join';
      line.textContent = host.invite() ? 'a new session just started' : 'one loop, always running';
    }
  }
  return { el, update, paint, join };
}

function copyStyles(from: Document, to: Document): void {
  for (const sheet of Array.from(from.styleSheets)) {
    try {
      const style = to.createElement('style');
      style.textContent = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      to.head.append(style);
    } catch {
      if (sheet.href) {
        const link = to.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        to.head.append(link);
      }
    }
  }
}

/* ---------- canvas version for Safari ---------- */

const CW = 480;
const CH = 270;
const SCALE = 2;
const hourFmt = new Intl.DateTimeFormat([], { hour: 'numeric' });
const clockFmt = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });

function drawCanvas(c: HTMLCanvasElement, host: PipHost, now: number): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string): string => cs.getPropertyValue(n).trim();
  const font = v('--font-ui') || 'monospace';
  const ink = v('--ink'), muted = v('--muted'), soft = v('--soft'), accent = v('--accent'), bg = v('--bg'), hatch = v('--hatch');
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CW, CH);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const joined = host.isJoined();
  const s = stateAt(now);
  ctx.fillStyle = ink;
  ctx.font = `700 40px ${font}`;
  ctx.fillText(joined ? LABEL[s.kind] : 'join', CW / 2, 74);
  ctx.fillStyle = muted;
  ctx.font = `400 14px ${font}`;
  const lines = LINES[s.kind];
  ctx.fillText(
    joined ? lines[Math.floor(now / ROTATE_MS) % lines.length] : host.invite() ? 'a new session just started' : 'open thisblock to join',
    CW / 2, 102,
  );
  if (!joined) return;

  const bw = 22, bh = 20, gap = 5, lane = 3;
  const total = Math.floor((CW - 40 + gap) / (bw + gap));
  const future = Math.min(5, Math.floor(total / 3));
  const cols = columns(now, total - 1 - future, future);
  const x0 = (CW - (total * (bw + gap) - gap)) / 2;
  const y0 = 150;
  cols.forEach((col, i) => {
    const x = x0 + i * (bw + gap);
    if (col.now) {
      ctx.fillStyle = col.cell === 'final' ? v('--accent-now') : v('--accent-glow');
      ctx.fillRect(x - 4, y0 - 7, bw + 8, 2 * bh + lane + 14);
      const p = Math.min(1, Math.max(0, (now - col.t) / (5 * 60 * 1000)));
      ctx.fillStyle = v('--accent-now');
      ctx.fillRect(x - 4, y0 - 7, bw + 8, 2);
      ctx.fillStyle = accent;
      ctx.fillRect(x - 4, y0 - 7, (bw + 8) * p, 2);
    }
    if (col.cell === 'unknown') {
      ctx.fillStyle = soft;
      ctx.fillRect(x, y0, bw, 2 * bh + lane);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y0, bw, 2 * bh + lane);
      ctx.clip();
      ctx.strokeStyle = hatch;
      ctx.lineWidth = 1.5;
      for (let k = -60; k < 60; k += 5) {
        ctx.beginPath();
        ctx.moveTo(x + k, y0 + 2 * bh + lane);
        ctx.lineTo(x + k + 2 * bh + lane, y0);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = col.cell === 'focus' ? ink : col.cell === 'final' ? accent : soft;
      ctx.fillRect(x, y0, bw, bh);
      ctx.fillStyle = col.cell === 'break' ? muted : soft;
      ctx.fillRect(x, y0 + bh + lane, bw, bh);
    }
    const d = new Date(col.t);
    const m = d.getMinutes();
    if (m === 0 || m === 30) {
      ctx.fillStyle = m === 0 ? ink : muted;
      ctx.textAlign = 'left';
      ctx.font = `400 11px ${font}`;
      ctx.fillText(m === 0 ? hourFmt.format(d).toLowerCase() : '30', x, y0 - 24);
      ctx.fillRect(x, y0 - 16, 1, m === 0 ? 6 : 4);
      ctx.textAlign = 'center';
    }
    if (col.now) {
      ctx.fillStyle = ink;
      ctx.font = `400 11px ${font}`;
      ctx.fillText(clockFmt.format(new Date(now)), x + bw / 2, y0 + 2 * bh + lane + 26);
    }
  });
}

/* ---------- the controller ---------- */

export function createPip(host: PipHost): Pip {
  const kind: 'document' | 'video' | null = docApi() ? 'document' : videoOk() ? 'video' : null;
  let win: Window | null = null;
  let view: ReturnType<typeof createMiniView> | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let video: HTMLVideoElement | null = null;

  const paintAll = (now: number): void => {
    if (view) { view.update(now); view.paint(now); }
    if (canvas) drawCanvas(canvas, host, now);
  };

  function cleanup(): void {
    const was = win !== null;
    win = null;
    view = null;
    if (video) { video.srcObject = null; video.remove(); }
    video = null;
    canvas = null;
    if (was) host.closed();
  }

  async function openDocument(): Promise<void> {
    const w = await docApi()!.requestWindow({ width: W, height: H, preferInitialWindowPlacement: true });
    win = w;
    w.document.title = 'thisblock';
    copyStyles(document, w.document);
    w.document.documentElement.dataset.theme = host.theme();
    w.document.body.classList.add('pip');
    view = createMiniView(host, () => w.innerWidth - 32);
    w.document.body.append(view.el);
    w.addEventListener('pagehide', cleanup);
    w.addEventListener('resize', () => view?.paint(Date.now()));
    w.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !host.isJoined()) { e.preventDefault(); host.join(); }
      else if (e.key === 'Escape' || e.key === 'p') w.close();
    });
    paintAll(Date.now());
    if (!host.isJoined()) view.join.focus();
  }

  async function openVideo(): Promise<void> {
    canvas = document.createElement('canvas');
    canvas.width = CW * SCALE;
    canvas.height = CH * SCALE;
    drawCanvas(canvas, host, Date.now());
    video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    document.body.append(video);
    video.srcObject = canvas.captureStream(2);
    await video.play();
    await video.requestPictureInPicture();
    video.addEventListener('leavepictureinpicture', cleanup, { once: true });
    win = window; // marks it open
  }

  return {
    supported: kind !== null,
    isOpen: () => win !== null && (kind === 'video' || !win.closed),
    async toggle() {
      if (this.isOpen()) {
        if (kind === 'document') win?.close();
        else if (document.pictureInPictureElement) await document.exitPictureInPicture();
        cleanup();
        return;
      }
      try {
        if (kind === 'document') await openDocument();
        else if (kind === 'video') await openVideo();
      } catch { cleanup(); }
    },
    tick(now) { if (win) paintAll(now); },
    refresh(now) {
      if (!win) return;
      if (kind === 'document') win.document.documentElement.dataset.theme = host.theme();
      paintAll(now);
    },
  };
}

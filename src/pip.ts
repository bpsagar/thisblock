import { h, key } from './dom';
import { blockIndex, kindAt } from './loop';
import { myKind, myTimer } from './me';
import { LABEL } from './copy';
import { createScene } from './scene';
import { createOdometer } from './odometer';

// A small always-on-top window: the status word and the timer, or a join button.
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
const H = 220;

/* ---------- window version: the same components as the app ---------- */

function createMiniView(host: PipHost) {
  // just the blocks, the state and the countdown (or a join button when you are not in)
  const scene = createScene();
  const word = h('div', { class: 'word', role: 'status' }, '');
  const odo = createOdometer('count');
  const timer = odo.el;
  const join = h('button', { class: 'btn', onClick: () => host.join() }, 'join', key('enter'));
  const el = h('div', { class: 'mini' }, scene.el, word, timer, join);
  let lastKind = '';
  let lastText = '';

  function update(now: number): void {
    const on = host.isJoined();
    // same tint as the app, and a short pulse when the state changes: this window is always on top
    const kind = on ? myKind(now) : kindAt(blockIndex(now));
    if (kind !== lastKind) {
      if (lastKind && on) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
      lastKind = kind;
      el.dataset.state = kind;
    }
    timer.style.display = on ? '' : 'none';
    join.style.display = on ? 'none' : '';
    join.classList.toggle('invite', host.invite());
    scene.set(on ? kind : 'idle');
    if (on) {
      const text = myTimer(now);
      if (word.textContent !== LABEL[kind]) word.textContent = LABEL[kind];
      if (text !== lastText) { odo.set(text); lastText = text; }
    } else {
      word.textContent = 'thisblock';
    }
  }
  return { el, update, join };
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

const CW = 360;
const CH = 140;
const SCALE = 2;

let canvasKind = '';
let canvasPulseUntil = 0;

function drawCanvas(c: HTMLCanvasElement, host: PipHost, now: number): void {
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string): string => cs.getPropertyValue(n).trim();
  const font = v('--font-ui') || 'monospace';
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const kindNow = host.isJoined() ? myKind(now) : kindAt(blockIndex(now));
  if (kindNow !== canvasKind) { if (canvasKind) canvasPulseUntil = now + 4000; canvasKind = kindNow; }
  ctx.fillStyle = v(`--tint-${kindNow}`) || v('--bg');
  ctx.fillRect(0, 0, CW, CH);
  if (now < canvasPulseUntil && Math.floor((canvasPulseUntil - now) / 500) % 2 === 0) {
    ctx.strokeStyle = v('--accent');
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, CW - 6, CH - 6);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  const joined = host.isJoined();
  ctx.fillStyle = v('--ink');
  ctx.font = `700 40px ${font}`;
  ctx.fillText(joined ? LABEL[kindNow] : 'join', CW / 2, 62);
  ctx.fillStyle = v('--muted');
  ctx.font = `400 18px ${font}`;
  // no clicks in this version, so joining happens in the app
  ctx.fillText(joined ? myTimer(now) : host.invite() ? 'a new session just started' : 'open thisblock to join', CW / 2, 96);
}

/* ---------- the controller ---------- */

export function createPip(host: PipHost): Pip {
  const kind: 'document' | 'video' | null = docApi() ? 'document' : videoOk() ? 'video' : null;
  let win: Window | null = null;
  let view: ReturnType<typeof createMiniView> | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let video: HTMLVideoElement | null = null;

  const paintAll = (now: number): void => {
    if (view) view.update(now);
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
    view = createMiniView(host);
    w.document.body.append(view.el);
    w.addEventListener('pagehide', cleanup);
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

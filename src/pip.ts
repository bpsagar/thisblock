import { myKind, myTimer } from './me';
import { LABEL } from './copy';

// A small always-on-top window, in portrait, with the same screen as the app: the join screen, or
// your day with its plan.
// Chrome and Edge (desktop, also as an installed app) can open a real HTML window: Document Picture-in-Picture.
// Safari has no such window, so there the state and the countdown are drawn on a canvas and shown as a video in picture-in-picture.
// Firefox has neither, so the command is hidden there.

/** the app's screen, built a second time for the mini window */
export interface MiniView {
  el: HTMLElement;
  /** every tick */
  tick(now: number): void;
  /** on block change, join, leave and theme change */
  refresh(now: number): void;
}

export interface PipHost {
  isJoined(): boolean;
  join(): void;
  leave(): void;
  theme(): 'light' | 'dark';
  view(): MiniView;
  /** the mini window was closed by the person */
  closed(): void;
}

export interface Pip {
  readonly supported: boolean;
  isOpen(): boolean;
  toggle(): Promise<void>;
  /** every tick */
  tick(now: number): void;
  /** on block change, join, leave and theme change */
  refresh(now: number): void;
}

interface DocPipApi { requestWindow(o?: Record<string, unknown>): Promise<Window>; window: Window | null }
const docApi = (): DocPipApi | undefined => (window as unknown as { documentPictureInPicture?: DocPipApi }).documentPictureInPicture;
const videoOk = (): boolean =>
  !!document.pictureInPictureEnabled && typeof HTMLVideoElement !== 'undefined' && 'requestPictureInPicture' in HTMLVideoElement.prototype;

const W = 320;
const H = 600;

/* ---------- window version: the app's own screen ---------- */

function createMini(host: PipHost) {
  const view = host.view();
  const el = document.createElement('div');
  el.className = 'mini';
  el.append(view.el);
  let lastKind = '';
  // the state's tint, and a short pulse when it changes: this window is always on top
  function state(now: number): void {
    const on = host.isJoined();
    const kind = on ? myKind(now) : 'idle';
    if (kind === lastKind) return;
    if (lastKind && lastKind !== 'idle' && on) { el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
    lastKind = kind;
    el.dataset.state = kind;
  }
  return {
    el,
    tick(now: number): void { state(now); view.tick(now); },
    refresh(now: number): void { state(now); view.refresh(now); },
  };
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

const CW = 240;
const CH = 400;
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
  const joined = host.isJoined();
  const kindNow = joined ? myKind(now) : 'focus';
  if (kindNow !== canvasKind) { if (canvasKind && joined) canvasPulseUntil = now + 4000; canvasKind = kindNow; }
  ctx.fillStyle = joined ? v(`--tint-${kindNow}`) || v('--bg') : v('--bg');
  ctx.fillRect(0, 0, CW, CH);
  if (now < canvasPulseUntil && Math.floor((canvasPulseUntil - now) / 500) % 2 === 0) {
    ctx.strokeStyle = v('--accent');
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, CW - 6, CH - 6);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if (joined) {
    ctx.fillStyle = v(`--c-${kindNow}`) || v('--ink');
    ctx.font = `700 18px ${font}`;
    ctx.fillText(LABEL[kindNow], CW / 2, CH / 2 - 44);
    ctx.fillStyle = v('--ink');
    ctx.font = `700 64px ${font}`;
    ctx.fillText(myTimer(now), CW / 2, CH / 2 + 24);
  } else {
    ctx.fillStyle = v('--ink');
    ctx.font = `700 32px ${font}`;
    ctx.fillText('join', CW / 2, CH / 2);
    ctx.fillStyle = v('--muted');
    ctx.font = `400 14px ${font}`;
    // no clicks in this version, so joining happens in the app
    ctx.fillText('open thisblock to join', CW / 2, CH / 2 + 30);
  }
}

/* ---------- the controller ---------- */

export function createPip(host: PipHost): Pip {
  const kind: 'document' | 'video' | null = docApi() ? 'document' : videoOk() ? 'video' : null;
  let win: Window | null = null;
  let view: ReturnType<typeof createMini> | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let video: HTMLVideoElement | null = null;

  const paintAll = (now: number): void => {
    if (view) view.tick(now);
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
    view = createMini(host);
    w.document.body.append(view.el);
    w.addEventListener('pagehide', cleanup);
    w.addEventListener('resize', () => view?.refresh(Date.now()));
    w.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !host.isJoined()) { e.preventDefault(); host.join(); }
      else if (e.key === 'l' && host.isJoined()) host.leave();
      else if (e.key === 'Escape' || e.key === 'p') w.close();
    });
    view.refresh(Date.now());
    if (!host.isJoined()) view.el.querySelector<HTMLElement>('.st-joinarea .btn')?.focus();
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
      if (view) view.refresh(now);
      if (canvas) drawCanvas(canvas, host, now);
    },
  };
}

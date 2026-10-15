import './style.css';
import { BLOCK_MS, blockIndex, blockStartMs, kindAt, sessionIndex, sessionInfo, stateAt } from './loop';
import { store, dayKey } from './store';
import { createFirstRun, type FirstRun } from './firstrun';
import { createFocus, LABEL, type Focus } from './focus';
import { createActions, type Action } from './actions';
import { openHow } from './overlay';
import { createStates } from './how';
import { notify, permission, request } from './notify';
import { mmss } from './dom';
import { createPip } from './pip';

type Screen = 'first' | 'focus';

const app = document.getElementById('app')!;
const currentSession = (now = Date.now()): number => sessionIndex(blockIndex(now));
/** Joined means joined for this session only. */
const isJoined = (now = Date.now()): boolean => store.session === currentSession(now);

let screen: Screen = isJoined() ? 'focus' : 'first';
let firstRun: FirstRun | null = null;
let focus: Focus | null = null;
let actionsUI: ReturnType<typeof createActions> | null = null;
const refreshActions = (): void => actionsUI?.refresh();
let closeOverlay: (() => void) | null = null;
let howStates: ReturnType<typeof createStates> | null = null;

// A block counts toward minutes today when the person was here for at least half of it.
let presentSince = Date.now();
let lastBlock = blockIndex(Date.now());
let lastTickAt = Date.now();
// True during the first block of a new session, for someone who was in the one before.
let inviteActive = false;
// A timer in a hidden tab can slow to once a minute. A longer gap means the computer slept or the tab froze.
const GAP_MS = 130_000;

const pip = createPip({
  isJoined: () => isJoined(),
  join: () => join(),
  invite: () => inviteActive,
  theme: () => effectiveTheme(),
  closed: () => refreshActions(),
});
const togglePip = (): void => { void pip.toggle().then(refreshActions); };

// Install prompt (Chromium). Safari and Firefox use their own menus.
interface InstallEvent extends Event { prompt(): Promise<void> }
let installEvent: InstallEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvent = e as InstallEvent; refreshActions(); });
window.addEventListener('appinstalled', () => { installEvent = null; refreshActions(); });

const effectiveTheme = (): 'light' | 'dark' =>
  document.documentElement.dataset.theme === 'dark' || document.documentElement.dataset.theme === 'light'
    ? (document.documentElement.dataset.theme as 'light' | 'dark')
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

function toggleTheme(): void {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.theme = next;
  pip.refresh(Date.now());
}

function join(): void {
  inviteActive = false;
  store.session = currentSession();
  store.left = false;
  presentSince = Date.now();
  if (screen !== 'focus') go('focus');
  pip.refresh(Date.now());
}

function leave(): void {
  inviteActive = false;
  store.session = null;
  store.left = true;
  document.title = 'thisblock';
  go('first');
  pip.refresh(Date.now());
}

function go(next: Screen): void {
  closeOverlay?.();
  if (screen === 'first' && next !== 'first') firstRun?.stop();
  screen = next;
  render();
}

function openHelp(): void {
  if (screen === 'first') { firstRun?.togglePanel(); return; }
  if (closeOverlay) { closeOverlay(); return; }
  howStates = createStates();
  const s = stateAt(Date.now());
  howStates.setActive(s.kind === 'focus' ? 0 : s.kind === 'final' ? 1 : 2);
  closeOverlay = openHow(howStates.el, () => { closeOverlay = null; howStates = null; });
}

function enableNotifications(): void {
  void request().then((p) => { refreshActions(); if (p === 'granted') void notify('test'); });
}

function items(): Action[] {
  const a: Action[] = [];
  if (isJoined()) a.push({ label: 'leave', key: 'l', run: leave });
  const perm = permission();
  if (perm === 'default') a.push({ label: 'enable notifications', key: 'n', run: enableNotifications });
  else if (perm === 'granted') a.push({ label: 'test notification', key: 'n', run: () => { void notify('test'); } });
  if (installEvent) a.push({ label: 'install app', key: 'i', run: installApp });
  if (pip.supported) a.push({ label: pip.isOpen() ? 'close mini window' : 'mini window', key: 'p', run: togglePip });
  a.push({ label: 'toggle theme', key: 't', run: toggleTheme });
  a.push({ label: 'how it works', key: '?', run: openHelp });
  return a;
}

function installApp(): void {
  void installEvent?.prompt();
  installEvent = null;
  refreshActions();
}

function render(): void {
  app.replaceChildren();
  firstRun = null;
  focus = null;
  actionsUI = createActions(items, runningMins);
  if (screen === 'first') {
    firstRun = createFirstRun(join, actionsUI.el);
    firstRun.setInvite(inviteActive);
    app.append(firstRun.el);
    firstRun.start();
    document.title = inviteActive ? 'join · thisblock' : 'thisblock';
  } else if (screen === 'focus') {
    focus = createFocus(actionsUI.el);
    app.append(focus.el);
    paint();
  }
}

// Minutes of the running focus block, shown live. Only counted when the block will be credited
// (you were here for at least half of it), so the number matches what lands when the block ends.
function runningMins(): number {
  const now = Date.now();
  if (!isJoined(now) || kindAt(lastBlock) === 'break') return 0;
  const start = blockStartMs(lastBlock);
  if (presentSince > start + BLOCK_MS / 2) return 0;
  return Math.floor((now - start) / 60000);
}

function paint(): void {
  focus?.paint(Date.now());
}

function onBlockChange(prevBlock: number, now: number): void {
  const s = stateAt(now);
  const prevSession = sessionIndex(prevBlock);
  const wasIn = store.session === prevSession;
  if (wasIn) {
    const prevStart = blockStartMs(prevBlock);
    if (kindAt(prevBlock) !== 'break' && presentSince <= prevStart + BLOCK_MS / 2) {
      store.addBlock(dayKey(new Date(prevStart + BLOCK_MS / 2)));
      refreshActions();
    }
  }
  if (currentSession(now) !== prevSession) {
    // A new session has started. Nobody carries over: you join each session yourself.
    if (wasIn) {
      store.session = null;
      inviteActive = s.pos === 0;
      document.title = inviteActive ? 'join · thisblock' : 'thisblock';
      if (screen === 'focus') go('first');
      if (!store.left && s.pos === 0) void notify('invite', 5, join);
    }
  } else if (inviteActive) {
    // the invite is for the first block only
    inviteActive = false;
    document.title = 'thisblock';
    firstRun?.setInvite(false);
  } else if (wasIn) {
    const justEnded = kindAt(prevBlock);
    if (s.kind === 'final') void notify('wrap');
    else if (s.kind === 'break' && justEnded === 'final') void notify('break', sessionInfo(now).b * 5);
  }
  if (screen === 'focus') paint();
  pip.refresh(now);
}

function tick(): void {
  const now = Date.now();
  if (now - lastTickAt > GAP_MS) presentSince = now;
  lastTickAt = now;
  const b = blockIndex(now);
  if (b !== lastBlock) {
    const prev = lastBlock;
    lastBlock = b;
    onBlockChange(prev, now);
  }
  pip.tick(now);
  actionsUI?.tick();
  if (screen === 'focus' && focus && isJoined(now)) {
    focus.tick(now);
    const s = stateAt(now);
    document.title = `${mmss(s.msLeft)} ${LABEL[s.kind]} · thisblock`;
  }
}

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (closeOverlay) {
    if (k === 'Escape') { e.preventDefault(); closeOverlay(); }
    else if (k === '?') { e.preventDefault(); closeOverlay(); }
    return;
  }
  if (k === 'Enter' && screen === 'first') { e.preventDefault(); join(); }
  else if (k === '?') { e.preventDefault(); openHelp(); }
  else if (k === 'Escape') {
    if (screen === 'first' && firstRun?.panelOpen()) firstRun.togglePanel(false);
  }
  else if (k === 'l' && screen === 'focus') leave();
  else if (k === 'n') {
    const p = permission();
    if (p === 'default') enableNotifications();
    else if (p === 'granted') void notify('test');
  }
  else if (k === 'p' && pip.supported) togglePip();
  else if (k === 'i' && installEvent) installApp();
  else if (k === 't') toggleTheme();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(paint, 120);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); paint(); } });

// Opened from the join button on a notification when the app was closed.
if (new URLSearchParams(location.search).get('join') === '1') {
  history.replaceState(null, '', location.pathname);
  store.session = currentSession();
  store.left = false;
  screen = 'focus';
}
// The app was already open: the service worker tells it to join.
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'join') join(); });

render();
tick();
window.setInterval(tick, 250);
// A worker keeps time even when the tab is in the background, so heads-ups arrive on the minute.
try {
  const url = URL.createObjectURL(new Blob(['setInterval(()=>postMessage(0),1000)'], { type: 'text/javascript' }));
  new Worker(url).onmessage = tick;
} catch { /* the interval above still runs */ }

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {}); });
}

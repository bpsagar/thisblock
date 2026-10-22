import './style.css';
import { blockIndex, blockStartMs } from './day';
import { myBlockAt, myBreakMins, myKind, myTimer, startDay } from './me';
import { store, dayKey } from './store';
import { LABEL } from './copy';
import { createStage, type Mode, type Stage, type Summary } from './stage';
import { createActions, todayMins, type Action } from './actions';
import { badge, clearNotifications, notify, permission, request } from './notify';
import { playCue, unlockAudio } from './sound';
import { createPip, type MiniView } from './pip';

const app = document.getElementById('app')!;
const isJoined = (): boolean => store.joined;

let screen: Mode = isJoined() ? 'live' : 'join';
// what you did since you joined, for the join screen when you leave
let summary: Summary | null = null;
// today's minutes when you joined, so leaving can show what you added
let joinMins = 0;
let stage: Stage | null = null;
let actionsUI: ReturnType<typeof createActions> | null = null;
const refreshActions = (): void => actionsUI?.refresh();

// Focus time counts tick by tick while you are in.
let lastBlock = blockIndex(Date.now());
let lastTickAt = Date.now();
// A timer in a hidden tab can slow to once a minute. A longer gap means the computer slept or the tab froze.
const GAP_MS = 130_000;

const pip = createPip({
  isJoined: () => isJoined(),
  join: () => join(),
  leave: () => leave(),
  view: () => miniView(),
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

// Joining starts your day, or carries on with today's plan if you were in earlier.
function join(): void {
  startDay(Date.now());
  store.joined = true;
  joinMins = todayMins();
  if (screen !== 'live') go('live');
  pip.refresh(Date.now());
}

function leave(): void {
  store.joined = false;
  document.title = 'thisblock';
  summary = { mins: todayMins() - joinMins };
  go('join');
  pip.refresh(Date.now());
}

// Both screens are modes of the one stage, so moving between them is a transition, not a redraw.
function go(next: Mode): void {
  screen = next;
  refreshActions();
  stage?.show(next, next === 'join' ? summary : null);
  if (next === 'join') document.title = 'thisblock';
}

function toggleNotifications(): void {
  const p = permission();
  if (p === 'denied' || p === 'unsupported') return;
  if (p === 'granted' && !store.notifyOff) { store.notifyOff = true; refreshActions(); return; }
  store.notifyOff = false;
  void request().then((next) => { refreshActions(); if (next === 'granted') void notify('test'); });
}

function toggleSound(): void {
  store.muted = !store.muted;
  if (!store.muted) playCue('join');
  refreshActions();
}

function items(): Action[] {
  const a: Action[] = [];
  if (isJoined()) a.push({ label: 'leave', key: 'l', run: leave });
  // app: install and the mini window, then a divider, then preferences
  if (installEvent) a.push({ label: 'install app', key: 'i', run: installApp });
  if (pip.supported) a.push({ label: pip.isOpen() ? 'close mini window' : 'show mini window', key: 'p', run: togglePip });
  const perm = permission();
  if (perm === 'denied') a.push({ label: 'notifications blocked', key: 'n', run: () => {}, checked: false, divider: true });
  else if (perm !== 'unsupported') {
    const on = perm === 'granted' && !store.notifyOff;
    a.push({ label: on ? 'disable notifications' : 'enable notifications', key: 'n', run: toggleNotifications, checked: on, divider: true });
  }
  a.push({ label: store.muted ? 'enable sound' : 'disable sound', key: 's', run: toggleSound, checked: !store.muted, divider: perm === 'unsupported' });
  a.push({ label: 'toggle theme', key: 't', run: toggleTheme });
  return a;
}

function installApp(): void {
  void installEvent?.prompt();
  installEvent = null;
  refreshActions();
}

function render(): void {
  actionsUI = createActions(items);
  stage = createStage({ join, actions: actionsUI.el, menu: actionsUI.menu, todayMins });
  app.replaceChildren(stage.el);
  go(screen);
}

// The mini window shows the same screen as the app: a second stage that follows this one.
function miniView(): MiniView {
  const acts = createActions(items);
  const st = createStage({ join, actions: acts.el, todayMins });
  let fresh = true;
  const follow = (): void => {
    if (!fresh && st.mode === screen) return;
    fresh = false;
    st.show(screen, screen === 'join' ? summary : null);
  };
  return {
    el: st.el,
    tick(now) { follow(); st.tick(now); acts.tick(); },
    refresh(now) { acts.refresh(); follow(); st.paint(now); },
  };
}

function paint(): void {
  stage?.paint(Date.now());
}

// While you are away, a state change leaves a dot on the app icon. Coming back clears it, and the notifications.
const away = (): boolean => document.hidden || !document.hasFocus();
function flag(): void { if (away()) badge(true); }
function welcomeBack(): void { if (away()) return; badge(false); void clearNotifications(); }
window.addEventListener('focus', welcomeBack);
document.addEventListener('visibilitychange', welcomeBack);

// Every 5 minutes: note the slot that ended, and say so when your state changes.
function onBlockChange(prevBlock: number, now: number): void {
  const prevKind = myKind(blockStartMs(prevBlock));
  if (isJoined()) {
    store.attend(prevBlock, prevKind);
    const at = blockStartMs(blockIndex(now));
    const k = myKind(at);
    if (k === 'final' && prevKind === 'focus') { playCue('wrap'); void notify('wrap'); flag(); }
    else if (k === 'break' && prevKind !== 'break') { playCue('break'); void notify('break', myBreakMins(at)); flag(); }
    else if (k !== 'break' && prevKind === 'break') { playCue('join'); void notify('focus', 0, myBlockAt(at)?.title); flag(); }
  }
  paint();
  pip.refresh(now);
}

function tick(): void {
  const now = Date.now();
  // the page takes on the colour of your state; the join screen stays plain
  const kindNow = isJoined() ? myKind(now) : 'idle';
  if (document.body.dataset.state !== kindNow) document.body.dataset.state = kindNow;
  // the time since the last tick is focus, unless it was a break or the computer slept in between
  if (isJoined() && now - lastTickAt <= GAP_MS && myKind(lastTickAt) !== 'break') store.addFocus(dayKey(new Date(now)), now - lastTickAt);
  lastTickAt = now;
  const b = blockIndex(now);
  if (b !== lastBlock) {
    const prev = lastBlock;
    lastBlock = b;
    onBlockChange(prev, now);
  }
  pip.tick(now);
  actionsUI?.tick();
  if (isJoined()) store.attend(b, myKind(now));
  stage?.tick(now);
  if (screen === 'live' && isJoined()) document.title = `${myTimer(now)} ${myBlockAt(now)?.title ?? LABEL[myKind(now)]} · thisblock`;
}

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'Enter' && screen === 'join') { e.preventDefault(); join(); }
  else if (k === 'l' && screen === 'live') leave();
  else if (k === 'n') toggleNotifications();
  else if (k === 'p' && pip.supported) togglePip();
  else if (k === 'i' && installEvent) installApp();
  else if (k === 't') toggleTheme();
  else if (k === 's') toggleSound();
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(paint, 120);
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); paint(); } });

unlockAudio();
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


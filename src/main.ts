import './style.css';
import { BLOCK_MS, blockIndex, blockStartMs, sessionIndex, stateAt } from './loop';
import { breakMinsFrom, kindFor, makePlan } from './plan';
import { myKind, myMsLeft } from './me';
import { store, dayKey } from './store';
import { createOnboarding, type Onboarding } from './onboarding';
import { createFocus, LABEL, type Focus } from './focus';
import { createActions, type Action } from './actions';
import { badge, clearNotifications, notify, permission, request } from './notify';
import { playCue, unlockAudio } from './sound';
import { mmss } from './dom';
import { createPip } from './pip';

type Screen = 'welcome' | 'first' | 'focus';

const app = document.getElementById('app')!;
const currentSession = (now = Date.now()): number => sessionIndex(blockIndex(now));
/**
 * Whether you are in at a block: during your own plan, or in the shared session you joined
 * (or landed in after your plan). Joined means for one session only.
 */
function inAt(block: number): boolean {
  const plan = store.plan;
  if (plan && block >= blockIndex(plan.join) && block < plan.syncAt) return true;
  return store.session !== null && store.session === sessionIndex(block);
}
const isJoined = (now = Date.now()): boolean => inAt(blockIndex(now));

let screen: Screen = isJoined() ? 'focus' : store.onboarded ? 'first' : 'welcome';
let onboarding: Onboarding | null = null;
let focus: Focus | null = null;
let actionsUI: ReturnType<typeof createActions> | null = null;
const refreshActions = (): void => actionsUI?.refresh();

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

// You always start on focus. Near the end of a session (or in wrap up or a break) you get a
// short plan of your own that lands you back on the shared schedule, see plan.ts.
function startJoin(now: number): void {
  const plan = makePlan(now);
  store.plan = plan;
  store.session = plan ? sessionIndex(plan.syncAt) : currentSession(now);
  store.left = false;
}

function join(): void {
  inviteActive = false;
  store.onboarded = true;
  startJoin(Date.now());
  presentSince = Date.now();
  if (screen !== 'focus') go('focus');
  pip.refresh(Date.now());
}

function leave(): void {
  inviteActive = false;
  store.session = null;
  store.plan = null;
  store.left = true;
  document.title = 'thisblock';
  go('first');
  pip.refresh(Date.now());
}

// Leaving the welcome conversation goes back to where the person was.
function finishWelcome(): void {
  store.onboarded = true;
  go(isJoined() ? 'focus' : 'first');
}

function go(next: Screen): void {
  screen = next;
  render();
}

// "how it works" replays the welcome conversation.
function openHelp(): void {
  if (screen === 'welcome') finishWelcome();
  else go('welcome');
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
  a.push({ label: 'how it works', key: '?', run: openHelp });
  return a;
}

function installApp(): void {
  void installEvent?.prompt();
  installEvent = null;
  refreshActions();
}

function render(): void {
  focus?.stop();
  app.replaceChildren();
  onboarding = null;
  focus = null;
  actionsUI = createActions(items, runningMins);
  if (screen === 'welcome' || screen === 'first') {
    // new people get the whole conversation, everyone else just its last screen
    onboarding = createOnboarding({ join, full: screen === 'welcome', skip: finishWelcome, actions: actionsUI.el, menu: actionsUI.menu });
    onboarding.setInvite(inviteActive);
    app.append(onboarding.el);
    document.title = inviteActive ? 'join · thisblock' : 'thisblock';
  } else if (screen === 'focus') {
    focus = createFocus(actionsUI.el, actionsUI.menu);
    app.append(focus.el);
    paint();
  }
}

// Minutes of the running focus block, shown live. Only counted when the block will be credited
// (you were here for at least half of it), so the number matches what lands when the block ends.
function runningMins(): number {
  const now = Date.now();
  if (!isJoined(now) || kindFor(store.plan, lastBlock) === 'break') return 0;
  const start = blockStartMs(lastBlock);
  if (presentSince > start + BLOCK_MS / 2) return 0;
  return Math.floor((now - start) / 60000);
}

function paint(): void {
  focus?.paint(Date.now());
}

// While you are away, a state change leaves a dot on the app icon. Coming back clears it, and the notifications.
const away = (): boolean => document.hidden || !document.hasFocus();
function flag(): void { if (away()) badge(true); }
function welcomeBack(): void { if (away()) return; badge(false); void clearNotifications(); }
window.addEventListener('focus', welcomeBack);
document.addEventListener('visibilitychange', welcomeBack);

function onBlockChange(prevBlock: number, now: number): void {
  const b = blockIndex(now);
  const s = stateAt(now);
  const plan = store.plan;
  const wasIn = inAt(prevBlock);
  const prevKind = kindFor(plan, prevBlock);
  if (wasIn) {
    store.attend(prevBlock, prevKind);
    const prevStart = blockStartMs(prevBlock);
    if (prevKind !== 'break' && presentSince <= prevStart + BLOCK_MS / 2) {
      store.addBlock(dayKey(new Date(prevStart + BLOCK_MS / 2)));
      refreshActions();
    }
  }
  // once you are back on the shared schedule the plan has done its job
  if (plan && b >= plan.syncAt) store.plan = null;
  const nowIn = inAt(b);
  if (wasIn && !nowIn) {
    // Your session is over. Nobody carries over: you join each session yourself.
    store.session = null;
    store.plan = null;
    inviteActive = s.pos === 0;
    document.title = inviteActive ? 'join · thisblock' : 'thisblock';
    if (screen === 'focus') go('first');
    if (!store.left && s.pos === 0) { playCue('join'); void notify('invite', 5, join); flag(); }
  } else if (inviteActive && sessionIndex(prevBlock) === sessionIndex(b)) {
    // the invite is for the first block only
    inviteActive = false;
    document.title = 'thisblock';
    onboarding?.setInvite(false);
  } else if (wasIn && nowIn) {
    const k = kindFor(plan, b);
    if (k === 'final' && prevKind !== 'final') { playCue('wrap'); void notify('wrap'); flag(); }
    else if (k === 'break' && prevKind === 'final') { playCue('break'); void notify('break', breakMinsFrom(plan, b)); flag(); }
  }
  if (screen === 'focus') paint();
  pip.refresh(now);
}

function tick(): void {
  const now = Date.now();
  // the whole page takes on the tint of your state (or of what is running, when you are not in)
  const kindNow = isJoined(now) ? myKind(now) : stateAt(now).kind;
  if (document.body.dataset.state !== kindNow) document.body.dataset.state = kindNow;
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
  if (screen === 'first') onboarding?.tick(now);
  if (isJoined(now)) store.attend(b, myKind(now));
  if (screen === 'focus' && focus && isJoined(now)) {
    focus.tick(now);
    document.title = `${mmss(myMsLeft(now))} ${LABEL[myKind(now)]} · thisblock`;
  }
}

document.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement | null;
  const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (screen === 'welcome' && k === '?') { e.preventDefault(); finishWelcome(); return; }
  if (screen === 'welcome' && (k === 'Enter' || k === 'ArrowRight' || k === 'ArrowLeft' || k === 'Escape')) {
    e.preventDefault();
    if (k === 'Enter') onboarding?.enter();
    else if (k === 'ArrowRight') onboarding?.next();
    else if (k === 'ArrowLeft') onboarding?.back();
    else onboarding?.skip();
    return;
  }
  if (k === 'Enter' && screen === 'first') { e.preventDefault(); join(); }
  else if (k === '?') { e.preventDefault(); openHelp(); }
  else if (k === 'l' && screen === 'focus') leave();
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

// Opened from the join button on a notification when the app was closed.
if (new URLSearchParams(location.search).get('join') === '1') {
  history.replaceState(null, '', location.pathname);
  startJoin(Date.now());
  screen = 'focus';
}
// The app was already open: the service worker tells it to join.
navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.type === 'join') join(); });

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

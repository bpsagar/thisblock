import { store } from './store';
// Quiet heads-ups for wrap up, break and focus. Sent only when you are not looking at the tab.
export type Perm = 'default' | 'granted' | 'denied' | 'unsupported';

export function permission(): Perm {
  try {
    return 'Notification' in window ? (Notification.permission as Perm) : 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export async function request(): Promise<Perm> {
  try {
    if ('Notification' in window && Notification.permission === 'default') await Notification.requestPermission();
  } catch { /* ignore */ }
  return permission();
}

export type Heads = 'wrap' | 'break' | 'focus' | 'test';

const COPY: Record<Heads, (mins: number, name?: string) => [string, string]> = {
  wrap: () => ['wrap up', 'five minutes. leave a breadcrumb.'],
  break: (m) => ['break', `${m} min. the blocks are off duty.`],
  focus: (_, name) => ['focus', name ?? "break's over. one thing. go."],
  test: () => ['thisblock', "notifications are on. we'll be brief."],
};

/** Sent only when you are not looking at the tab. Clicking one brings the app forward. */
export async function notify(kind: Heads, mins = 5, name?: string): Promise<void> {
  try {
    if (permission() !== 'granted' || (kind !== 'test' && store.notifyOff)) return;
    if (kind !== 'test' && !document.hidden && document.hasFocus()) return;
    const [title, body] = COPY[kind](mins, name);
    const opts: NotificationOptions = {
      body, tag: `thisblock-${kind}`, icon: import.meta.env.BASE_URL + 'icons/icon-192.png', badge: import.meta.env.BASE_URL + 'icons/icon-192.png', data: { kind },
    };
    // state changes stay on screen until you deal with them, so they are hard to miss
    if (kind !== 'test') opts.requireInteraction = true;
    await clearNotifications(); // only the latest state change is worth showing
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg?.active) {
      await reg.showNotification(title, opts);
    } else {
      const n = new Notification(title, opts);
      n.onclick = () => { window.focus(); n.close(); };
    }
  } catch { /* ignore */ }
}

/** Close what is still on screen, e.g. when you come back to the app or the state moves on. */
export async function clearNotifications(): Promise<void> {
  try {
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    for (const n of (await reg?.getNotifications()) ?? []) if (n.tag.startsWith('thisblock')) n.close();
  } catch { /* ignore */ }
}

/** A dot on the installed app's icon (dock or taskbar) until you look at the app again. */
type BadgeNav = Navigator & { setAppBadge?: () => Promise<void>; clearAppBadge?: () => Promise<void> };
export function badge(on: boolean): void {
  const nav = navigator as BadgeNav;
  try { void (on ? nav.setAppBadge?.() : nav.clearAppBadge?.())?.catch(() => {}); } catch { /* ignore */ }
}

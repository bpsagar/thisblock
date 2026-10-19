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

export type Heads = 'wrap' | 'break' | 'invite' | 'test';

const COPY: Record<Heads, (mins: number) => [string, string]> = {
  wrap: () => ['wrap up', 'five minutes. leave a breadcrumb.'],
  break: (m) => ['break', `${m} min. the blocks are off duty.`],
  invite: () => ['new session', "the beat's starting. you in?"],
  test: () => ['thisblock', "notifications are on. we'll be brief."],
};

/**
 * Sent only when you are not looking at the tab. The invite has a join button
 * (Chromium, through the service worker). Elsewhere clicking it opens the app.
 */
export async function notify(kind: Heads, mins = 5, onClick?: () => void): Promise<void> {
  try {
    if (permission() !== 'granted' || (kind !== 'test' && store.notifyOff)) return;
    if (kind !== 'test' && !document.hidden && document.hasFocus()) return;
    const [title, body] = COPY[kind](mins);
    const opts: NotificationOptions & { actions?: { action: string; title: string }[] } = {
      body, tag: `thisblock-${kind}`, icon: import.meta.env.BASE_URL + 'icons/icon-192.png', badge: import.meta.env.BASE_URL + 'icons/icon-192.png', data: { kind },
    };
    if (kind === 'invite') opts.actions = [{ action: 'join', title: 'join' }];
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg?.active) {
      await reg.showNotification(title, opts);
    } else {
      const n = new Notification(title, opts);
      n.onclick = () => { window.focus(); onClick?.(); n.close(); };
    }
  } catch { /* ignore */ }
}

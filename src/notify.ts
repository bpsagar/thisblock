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
  wrap: () => ['wrap up', 'start wrapping up. finish the thought, note where you stopped.'],
  break: (m) => ['break', `${m} min. reset, drink some water.`],
  invite: () => ['focus', 'a new session is starting. join to be part of it.'],
  test: () => ['thisblock', 'notifications are on. you will hear about wrap up and breaks here.'],
};

/**
 * Sent only when you are not looking at the tab. The invite has a join button
 * (Chromium, through the service worker). Elsewhere clicking it opens the app.
 */
export async function notify(kind: Heads, mins = 5, onClick?: () => void): Promise<void> {
  try {
    if (permission() !== 'granted') return;
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

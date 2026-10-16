// localStorage with a safe fallback, so the app still works when storage is blocked.
const mem = new Map<string, string>();

function get(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return mem.get(key) ?? null;
  }
}
function set(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    mem.set(key, value);
  }
}
function del(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    mem.delete(key);
  }
}

export const store = {
  /** The session the person has joined. A new session starts without them until they join again. */
  get session(): number | null {
    const v = get('tb.session');
    return v === null || v === '' ? null : Number(v);
  },
  set session(v: number | null) {
    if (v === null) del('tb.session');
    else set('tb.session', String(v));
  },
  /** True once the person pressed leave themselves, so they get no invite for the next session. */
  get left(): boolean {
    return get('tb.left') === '1';
  },
  set left(v: boolean) {
    if (v) set('tb.left', '1');
    else del('tb.left');
  },
  get theme(): 'light' | 'dark' | null {
    const t = get('tb.theme');
    return t === 'light' || t === 'dark' ? t : null;
  },
  set theme(v: 'light' | 'dark' | null) {
    if (v) set('tb.theme', v);
    else del('tb.theme');
  },
  /** sound cues off */
  get muted(): boolean {
    return get('tb.muted') === '1';
  },
  set muted(v: boolean) {
    if (v) set('tb.muted', '1');
    else del('tb.muted');
  },
  /** focus blocks completed per local day, key YYYY-MM-DD */
  get log(): Record<string, number> {
    try {
      const raw = JSON.parse(get('tb.log') ?? '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  },
  addBlock(day: string): void {
    const log = this.log;
    log[day] = (log[day] ?? 0) + 1;
    set('tb.log', JSON.stringify(log));
  },
};

export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

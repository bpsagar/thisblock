import type { Block, Kind } from './day';

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

// left over from the shared loop
for (const k of ['tb.session', 'tb.plan', 'tb.joinedAt', 'tb.left', 'tb.onboarded']) del(k);

export const store = {
  /** You are in: your day is running and focus counts. Until you press leave. */
  get joined(): boolean {
    return get('tb.joined') === '1';
  },
  set joined(v: boolean) {
    if (v) set('tb.joined', '1');
    else del('tb.joined');
  },
  /** your plan: the day it was made, and its blocks */
  get day(): { created: string; blocks: Block[] } | null {
    try {
      const d = JSON.parse(get('tb.day') ?? 'null');
      return d && typeof d.created === 'string' && Array.isArray(d.blocks) ? d : null;
    } catch {
      return null;
    }
  },
  set day(v: { created: string; blocks: Block[] } | null) {
    if (v) set('tb.day', JSON.stringify(v));
    else del('tb.day');
  },
  get theme(): 'light' | 'dark' | null {
    const t = get('tb.theme');
    return t === 'light' || t === 'dark' ? t : null;
  },
  set theme(v: 'light' | 'dark' | null) {
    if (v) set('tb.theme', v);
    else del('tb.theme');
  },
  /** notifications switched off inside the app (the browser permission stays as it is) */
  get notifyOff(): boolean {
    return get('tb.notifyoff') === '1';
  },
  set notifyOff(v: boolean) {
    if (v) set('tb.notifyoff', '1');
    else del('tb.notifyoff');
  },
  /** sound cues off */
  get muted(): boolean {
    return get('tb.muted') === '1';
  },
  set muted(v: boolean) {
    if (v) set('tb.muted', '1');
    else del('tb.muted');
  },
  /** the 5 minute slots you were in, and what each was, so the plan shows what you did */
  get attended(): Record<string, Kind> {
    try {
      const raw = JSON.parse(get('tb.attended') ?? '{}');
      return raw && typeof raw === 'object' ? raw : {};
    } catch {
      return {};
    }
  },
  attend(block: number, kind: Kind): void {
    const a = this.attended;
    if (a[block] === kind) return;
    a[block] = kind;
    // a day of slots is plenty
    for (const k of Object.keys(a)) if (Number(k) < block - 288) delete a[k];
    set('tb.attended', JSON.stringify(a));
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

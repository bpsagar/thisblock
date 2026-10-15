/** m:ss, or h:mm:ss past an hour. Counts up, so it never needs rounding up. */
export function fmtElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** Parts for "2 h 5 min": under an hour only minutes, whole hours drop the minutes. */
export function splitMins(mins: number): { h: number; m: number } {
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

type Kid = Node | string | null | false | undefined;
type Props = Record<string, unknown> | null;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props, ...kids: Kid[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid != null && kid !== false) el.append(kid);
  return el;
}

export const key = (t: string): HTMLElement => h('span', { class: 'key' }, t);

export function logo(size: number): string {
  const g = 6, r = 12, hh = 37;
  const ds = (x: number, y: number, w: number, hgt: number) =>
    `M${x},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + hgt - r} A${r},${r} 0 0 1 ${x + w - r},${y + hgt} H${x} Z`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><rect x="18" y="10" width="14" height="80" fill="var(--accent)"/><path d="${ds(38, 10, 44, hh)}" fill="var(--ink)"/><path d="${ds(38, 10 + hh + g, 44, hh)}" fill="var(--muted)"/></svg>`;
}

export function topbar(right?: Node | null): HTMLElement {
  return h('header', { class: 'top' },
    h('div', { class: 'brand', html: `${logo(22)}<span><b>this</b>block</span>` }),
    right ?? null,
  );
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

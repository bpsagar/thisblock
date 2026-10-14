import { h } from './dom';

export function openHow(content: HTMLElement, onClose: () => void): () => void {
  const pop = h('div', { class: 'pop wide', role: 'dialog', 'aria-label': 'How it works', style: 'background:transparent;border:0;box-shadow:none' }, content);
  const scrim = h('div', { class: 'scrim mid' }, pop);
  function close(): void { scrim.remove(); onClose(); }
  scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) close(); });
  document.body.append(scrim);
  return close;
}

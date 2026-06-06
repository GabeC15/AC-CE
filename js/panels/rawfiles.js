// rawfiles.js — power-user view: pick any unpacked data file and edit its text
// directly. Edits flow back through the same change tracking as the structured
// panels, so they're saved (and re-packed) together.
import { h, clear } from '../ui/dom.js';

export function renderRawFiles(car, ctx) {
  const names = car.entryNames();
  const editor = h('textarea', { class: 'raw-editor', spellcheck: 'false', wrap: 'off' });
  const title = h('div', { class: 'raw-title subtle' }, 'Select a file');
  let current = null;

  const list = h('div', { class: 'raw-list' }, names.map((name) => {
    const item = h('button', { class: 'raw-item', onClick: () => select(name, item) }, name);
    return item;
  }));

  function select(name, item) {
    current = name;
    title.textContent = name;
    editor.value = car.entryText(name) ?? '';
    list.querySelectorAll('.raw-item').forEach((b) => b.classList.remove('active'));
    item.classList.add('active');
  }

  editor.addEventListener('change', () => {
    if (!current) return;
    car.setEntryText(current, editor.value);
    ctx.markChanged();
  });

  // Open a sensible default.
  const first = names.find((n) => n.toLowerCase() === 'car.ini') || names[0];
  if (first) requestAnimationFrame(() => select(first, list.querySelector('.raw-item')));

  return h('div', { class: 'panel raw-panel' },
    list,
    h('div', { class: 'raw-main' }, title, editor));
}

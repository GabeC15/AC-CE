// controls.js — reusable, data-bound form controls for the editor panels.
//
// Each "bound" control reads its current value straight from the car's parsed
// INI and writes edits back (re-serializing that entry) on change, notifying
// the app via ctx.markChanged so the Save button lights up. Controls that bind
// to a key the car doesn't have return null, so panels can stay declarative and
// simply skip missing fields across differently-equipped cars.

import { h } from './dom.js';

/** A titled card grouping related controls. Falsy children are dropped. */
export function card(title, children, opts = {}) {
  const kids = children.filter(Boolean);
  if (!kids.length && !opts.keepEmpty) return null;
  return h('section', { class: 'card' }, h('h3', {}, title), h('div', { class: 'card-body' }, kids));
}

/**
 * Paired slider + number input bound to ini[file][section][key].
 * @returns {HTMLElement|null} null if the key is absent on this car.
 */
export function boundNumber(car, ctx, spec) {
  const { file, section, key, label, min = 0, max = 100, step = 1, unit = '' } = spec;
  const ini = car.ini(file);
  if (!ini || !ini.has(section, key)) return null;

  const initial = ini.getNumber(section, key);
  const tip = ini.getComment(section, key);

  const range = h('input', { type: 'range', min, max, step, value: initial });
  const num = h('input', { type: 'number', min, max, step, value: initial, class: 'num' });

  const commit = (val) => {
    range.value = val;
    num.value = val;
    ini.set(section, key, val);
    car.commitIni(file);
    ctx.markChanged();
  };
  range.addEventListener('input', () => commit(range.value));
  num.addEventListener('change', () => commit(num.value));

  return h('div', { class: 'field', title: tip },
    h('label', {}, label, unit ? h('span', { class: 'unit' }, ` ${unit}`) : null),
    h('div', { class: 'field-inputs' }, range, num));
}

/** Single-line text input bound to ini[file][section][key]. */
export function boundText(car, ctx, spec) {
  const { file, section, key, label } = spec;
  const ini = car.ini(file);
  if (!ini || !ini.has(section, key)) return null;

  const input = h('input', { type: 'text', value: ini.get(section, key), class: 'text' });
  input.addEventListener('change', () => {
    ini.set(section, key, input.value);
    car.commitIni(file);
    ctx.markChanged();
  });
  return h('div', { class: 'field', title: ini.getComment(section, key) },
    h('label', {}, label), h('div', { class: 'field-inputs' }, input));
}

/** Checkbox bound to a 0/1 INI flag (e.g. electronics PRESENT/ACTIVE). */
export function boundToggle(car, ctx, spec) {
  const { file, section, key, label } = spec;
  const ini = car.ini(file);
  if (!ini || !ini.has(section, key)) return null;

  const input = h('input', { type: 'checkbox', checked: ini.getNumber(section, key) === 1 });
  input.addEventListener('change', () => {
    ini.set(section, key, input.checked ? 1 : 0);
    car.commitIni(file);
    ctx.markChanged();
  });
  return h('div', { class: 'field', title: ini.getComment(section, key) },
    h('label', {}, label), h('div', { class: 'field-inputs' }, input));
}

/** A read-only labelled stat (for the overview). */
export function stat(label, value) {
  return h('div', { class: 'stat' }, h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value' }, value == null || value === '' ? '—' : String(value)));
}

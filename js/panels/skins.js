// skins.js — browse and edit a car's skins/liveries. Each skin shows its
// preview and an editable form for ui_skin.json (skin name, driver, team,
// number, country, priority). Saving writes skins/<skin>/ui_skin.json, creating
// it if the skin didn't have one.
import { h } from '../ui/dom.js';

const FIELDS = [
  ['skinname', 'Skin name'],
  ['drivername', 'Driver'],
  ['team', 'Team'],
  ['number', 'Number'],
  ['country', 'Country'],
];

export function renderSkins(car, ctx) {
  if (!car.skins.length) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'This car has no skins folder.')));
  }
  return h('div', { class: 'panel' },
    h('div', { class: 'skin-grid' }, car.skins.map((skin) => skinCard(car, ctx, skin))));
}

function skinCard(car, ctx, skin) {
  // Edit a live object; create it on first edit if the skin had no ui_skin.json.
  const ui = skin.ui || {};
  const touch = () => { car.setSkin(skin.name, ui); ctx.markChanged(); };

  const textField = (key, label) => {
    const input = h('input', { type: 'text', value: ui[key] == null ? '' : ui[key] });
    input.addEventListener('change', () => { ui[key] = input.value; touch(); });
    return h('div', { class: 'field stacked' }, h('label', {}, label), h('div', { class: 'field-inputs' }, input));
  };

  const priority = h('input', { type: 'number', step: 1, value: ui.priority == null ? '' : ui.priority });
  priority.addEventListener('change', () => { ui.priority = priority.value === '' ? '' : Number(priority.value); touch(); });

  return h('figure', { class: 'skin skin-edit' },
    skin.previewUrl
      ? h('img', { src: skin.previewUrl, alt: skin.name, loading: 'lazy' })
      : h('div', { class: 'skin-noimg' }, 'no preview'),
    h('figcaption', {},
      h('div', { class: 'skin-folder subtle small' }, skin.name + (skin.ui ? '' : ' · (no ui_skin.json yet)')),
      h('div', { class: 'skin-form' },
        FIELDS.map(([k, l]) => textField(k, l)),
        h('div', { class: 'field stacked' }, h('label', {}, 'Priority'), h('div', { class: 'field-inputs' }, priority)))));
}

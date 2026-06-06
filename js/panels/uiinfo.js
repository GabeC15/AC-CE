// uiinfo.js — form editor for ui/ui_car.json (what Content Manager shows in the
// car list: name, brand, class, specs, tags, description).
import { h } from '../ui/dom.js';
import { card } from '../ui/controls.js';

export function renderUiInfo(car, ctx) {
  if (!car.ui) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' },
        'No readable ui/ui_car.json was found for this car.')));
  }
  const ui = car.ui;
  ui.specs = ui.specs || {};
  const touched = () => { car.setUi(ui); ctx.markChanged(); };

  // Bind a text field to a property on an object.
  const text = (obj, key, label, opts = {}) => {
    const Tag = opts.area ? 'textarea' : 'input';
    const input = h(Tag, opts.area ? { rows: 5 } : { type: 'text' });
    input.value = obj[key] == null ? '' : obj[key];
    input.addEventListener('change', () => { obj[key] = input.value; touched(); });
    return h('div', { class: 'field stacked' }, h('label', {}, label),
      h('div', { class: 'field-inputs' }, input));
  };

  // tags is an array; edit as comma-separated text.
  const tags = h('input', { type: 'text', value: (ui.tags || []).join(', ') });
  tags.addEventListener('change', () => {
    ui.tags = tags.value.split(',').map((s) => s.trim()).filter(Boolean);
    touched();
  });

  return h('div', { class: 'panel' },
    h('div', { class: 'card-grid' },
      card('Identity', [
        text(ui, 'name', 'Name'),
        text(ui, 'brand', 'Brand'),
        text(ui, 'class', 'Class'),
        text(ui, 'year', 'Year'),
        text(ui, 'country', 'Country'),
        text(ui, 'author', 'Author'),
      ]),
      card('Specs', [
        text(ui.specs, 'bhp', 'Power (bhp)'),
        text(ui.specs, 'torque', 'Torque'),
        text(ui.specs, 'weight', 'Weight'),
        text(ui.specs, 'topspeed', 'Top speed'),
        text(ui.specs, 'acceleration', '0–100'),
        text(ui.specs, 'pwratio', 'P/W ratio'),
      ])),
    card('Tags', [h('div', { class: 'field stacked' },
      h('label', {}, 'Tags (comma-separated)'),
      h('div', { class: 'field-inputs' }, tags))]),
    card('Description', [text(ui, 'description', 'Description', { area: true })]));
}

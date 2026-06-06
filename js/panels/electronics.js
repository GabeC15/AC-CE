// electronics.js — Electronics tab: driver aids from electronics.ini (traction
// control, ABS, electronic diff lock) with present/active toggles and limits.
import { h } from '../ui/dom.js';
import { card, boundNumber, boundToggle } from '../ui/controls.js';

const SYSTEMS = [
  ['TRACTION_CONTROL', 'Traction control'],
  ['ABS', 'ABS'],
  ['EDL', 'Electronic diff lock'],
];

export function renderElectronics(car, ctx) {
  const elec = car.ini('electronics.ini');
  const cards = [];

  if (elec) {
    for (const [section, label] of SYSTEMS) {
      if (!elec.has(section)) continue;
      cards.push(card(label, [
        boundToggle(car, ctx, { file: 'electronics.ini', section, key: 'PRESENT', label: 'Fitted' }),
        boundToggle(car, ctx, { file: 'electronics.ini', section, key: 'ACTIVE', label: 'Active by default' }),
        boundNumber(car, ctx, { file: 'electronics.ini', section, key: 'SLIP_RATIO_LIMIT', label: 'Slip limit', min: 0, max: 0.5, step: 0.005 }),
        boundNumber(car, ctx, { file: 'electronics.ini', section, key: 'RATE_HZ', label: 'Rate', min: 0, max: 500, step: 10, unit: 'Hz' }),
        boundNumber(car, ctx, { file: 'electronics.ini', section, key: 'MIN_SPEED_KMH', label: 'Min speed', min: 0, max: 100, step: 1, unit: 'km/h' }),
      ], { keepEmpty: true }));
    }
  }

  if (!cards.length) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'This car has no electronics.ini (no driver aids defined).')));
  }
  return h('div', { class: 'panel' }, h('div', { class: 'card-grid' }, cards));
}

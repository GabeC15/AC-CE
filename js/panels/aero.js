// aero.js — Aero tab: per-wing aerodynamic tuning (aero.ini) with interactive
// CL/CD vs angle-of-attack curves. Cards self-skip when a key is absent.
import { h } from '../ui/dom.js';
import { card, boundNumber } from '../ui/controls.js';
import { buildWingCurve } from '../ui/wingcurve.js';

export function renderAero(car, ctx) {
  const aero = car.ini('aero.ini');
  const rows = [];

  if (aero) {
    for (const w of aero.indexedSections('WING_')) {
      const name = aero.get(w, 'NAME') || w;
      const label = `${titleCase(name)} wing`;
      const settings = card(label, [
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'ANGLE', label: 'Angle', min: -20, max: 20, step: 0.1, unit: '°' }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'CL_GAIN', label: 'Lift gain (CL)', min: 0, max: 5, step: 0.05 }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'CD_GAIN', label: 'Drag gain (CD)', min: 0, max: 5, step: 0.05 }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'CHORD', label: 'Chord', min: 0, max: 3, step: 0.01, unit: 'm' }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'SPAN', label: 'Span', min: 0, max: 3, step: 0.01, unit: 'm' }),
        infoRow('Position (x,y,z)', aero.get(w, 'POSITION')),
        infoRow('CL / CD source', `${aero.get(w, 'LUT_AOA_CL') || '—'} · ${aero.get(w, 'LUT_AOA_CD') || '—'}`),
      ], { keepEmpty: true });

      const curve = buildWingCurve(car, ctx, {
        label,
        clName: aero.get(w, 'LUT_AOA_CL'),
        cdName: aero.get(w, 'LUT_AOA_CD'),
        clGain: aero.get(w, 'CL_GAIN'),
        cdGain: aero.get(w, 'CD_GAIN'),
      });

      // Each wing is one row: its settings card beside its own CL/CD graph.
      rows.push(h('div', { class: curve ? 'aero-wing' : 'aero-wing solo' }, settings, curve));
    }
  }

  if (!rows.length) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'This car has no aero.ini.')));
  }

  return h('div', { class: 'panel' }, rows);
}

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function infoRow(label, value) {
  return h('div', { class: 'field info' },
    h('label', {}, label),
    h('div', { class: 'field-inputs subtle small' }, value || '—'));
}

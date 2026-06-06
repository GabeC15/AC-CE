// aero.js — Aero tab: per-wing aerodynamic tuning (aero.ini) with interactive
// CL/CD vs angle-of-attack curves. Cards self-skip when a key is absent.
import { h } from '../ui/dom.js';
import { card, boundNumber } from '../ui/controls.js';
import { buildWingCurve } from '../ui/wingcurve.js';

export function renderAero(car, ctx) {
  const aero = car.ini('aero.ini');
  const wingCards = [];
  const curveCards = [];

  if (aero) {
    for (const w of aero.indexedSections('WING_')) {
      const name = aero.get(w, 'NAME') || w;
      const label = `${titleCase(name)} wing`;
      wingCards.push(card(label, [
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'ANGLE', label: 'Angle', min: -20, max: 20, step: 0.1, unit: '°' }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'CL_GAIN', label: 'Lift gain (CL)', min: 0, max: 5, step: 0.05 }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'CD_GAIN', label: 'Drag gain (CD)', min: 0, max: 5, step: 0.05 }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'CHORD', label: 'Chord', min: 0, max: 3, step: 0.01, unit: 'm' }),
        boundNumber(car, ctx, { file: 'aero.ini', section: w, key: 'SPAN', label: 'Span', min: 0, max: 3, step: 0.01, unit: 'm' }),
        infoRow('Position (x,y,z)', aero.get(w, 'POSITION')),
        infoRow('CL / CD source', `${aero.get(w, 'LUT_AOA_CL') || '—'} · ${aero.get(w, 'LUT_AOA_CD') || '—'}`),
      ], { keepEmpty: true }));

      const curve = buildWingCurve(car, ctx, {
        label,
        clName: aero.get(w, 'LUT_AOA_CL'),
        cdName: aero.get(w, 'LUT_AOA_CD'),
        clGain: aero.get(w, 'CL_GAIN'),
        cdGain: aero.get(w, 'CD_GAIN'),
      });
      if (curve) curveCards.push(curve);
    }
  }

  if (!wingCards.length) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'This car has no aero.ini.')));
  }

  return h('div', { class: 'panel' },
    h('div', { class: 'card-grid' }, wingCards),
    curveCards.length ? h('div', { class: 'card-grid curve-grid' }, curveCards) : null);
}

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function infoRow(label, value) {
  return h('div', { class: 'field info' },
    h('label', {}, label),
    h('div', { class: 'field-inputs subtle small' }, value || '—'));
}

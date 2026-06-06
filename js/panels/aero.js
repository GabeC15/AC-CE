// aero.js — Aero & Electronics tab: per-wing aerodynamic tuning (aero.ini) and
// driver-aid settings (electronics.ini). Both are optional; cards self-skip when
// the underlying section/key is absent.
import { h } from '../ui/dom.js';
import { card, boundNumber, boundToggle } from '../ui/controls.js';
import { buildWingCurve } from '../ui/wingcurve.js';

export function renderAero(car, ctx) {
  const aero = car.ini('aero.ini');
  const elec = car.ini('electronics.ini');

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

  const elecCards = [];
  if (elec) {
    const systems = [
      ['TRACTION_CONTROL', 'Traction control'],
      ['ABS', 'ABS'],
      ['EDL', 'Electronic diff lock'],
    ];
    for (const [section, label] of systems) {
      if (!elec.has(section)) continue;
      elecCards.push(card(label, [
        boundToggle(car, ctx, { file: 'electronics.ini', section, key: 'PRESENT', label: 'Fitted' }),
        boundToggle(car, ctx, { file: 'electronics.ini', section, key: 'ACTIVE', label: 'Active by default' }),
        boundNumber(car, ctx, { file: 'electronics.ini', section, key: 'SLIP_RATIO_LIMIT', label: 'Slip limit', min: 0, max: 0.5, step: 0.005 }),
        boundNumber(car, ctx, { file: 'electronics.ini', section, key: 'RATE_HZ', label: 'Rate', min: 0, max: 500, step: 10, unit: 'Hz' }),
        boundNumber(car, ctx, { file: 'electronics.ini', section, key: 'MIN_SPEED_KMH', label: 'Min speed', min: 0, max: 100, step: 1, unit: 'km/h' }),
      ], { keepEmpty: true }));
    }
  }

  if (!wingCards.length && !elecCards.length) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'This car has no aero.ini or electronics.ini.')));
  }

  return h('div', { class: 'panel' },
    wingCards.length ? h('h2', { class: 'panel-h' }, 'Aerodynamics') : null,
    wingCards.length ? h('div', { class: 'card-grid' }, wingCards) : null,
    curveCards.length ? h('div', { class: 'card-grid curve-grid' }, curveCards) : null,
    elecCards.length ? h('h2', { class: 'panel-h' }, 'Electronics & assists') : null,
    elecCards.length ? h('div', { class: 'card-grid' }, elecCards) : null);
}

function titleCase(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

function infoRow(label, value) {
  return h('div', { class: 'field info' },
    h('label', {}, label),
    h('div', { class: 'field-inputs subtle small' }, value || '—'));
}

// suspension.js — Suspension setup tab: a live geometry diagram on top, with
// per-axle alignment, spring/ARB, damper and bump-stop editors below. Geometry-
// affecting controls refresh the diagram as you drag.
import { h, clear } from '../ui/dom.js';
import { card, boundNumber } from '../ui/controls.js';
import { buildSuspensionDiagram } from '../ui/suspensiondiagram.js';
import { buildLinkage } from '../ui/suspensionlinkage.js';

export function renderSuspension(car, ctx) {
  const ini = car.ini('suspensions.ini');
  if (!ini) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'No suspensions.ini found for this car.')));
  }

  const diagramHost = h('div', { class: 'susp-diagram' });
  const refresh = () => { clear(diagramHost); diagramHost.append(buildSuspensionDiagram(readGeom(ini))); };

  // Wrapped ctx: geometry edits also redraw the diagram.
  const gctx = { markChanged() { ctx.markChanged(); refresh(); } };
  const n = (c, spec) => boundNumber(car, c, { file: 'suspensions.ini', ...spec });

  const alignment = card('Geometry & alignment', [
    n(gctx, { section: 'BASIC', key: 'WHEELBASE', label: 'Wheelbase', min: 1.5, max: 4, step: 0.001, unit: 'm' }),
    n(gctx, { section: 'BASIC', key: 'CG_LOCATION', label: 'Weight dist (F)', min: 0.3, max: 0.7, step: 0.001 }),
    n(gctx, { section: 'FRONT', key: 'TRACK', label: 'Front track', min: 1, max: 2.2, step: 0.001, unit: 'm' }),
    n(gctx, { section: 'REAR', key: 'TRACK', label: 'Rear track', min: 1, max: 2.2, step: 0.001, unit: 'm' }),
    n(gctx, { section: 'FRONT', key: 'STATIC_CAMBER', label: 'Front camber', min: -6, max: 2, step: 0.1, unit: '°' }),
    n(gctx, { section: 'REAR', key: 'STATIC_CAMBER', label: 'Rear camber', min: -6, max: 2, step: 0.1, unit: '°' }),
    toeField(car, gctx, ini, 'FRONT', 'Front toe'),
    toeField(car, gctx, ini, 'REAR', 'Rear toe'),
  ]);

  const springs = card('Springs & anti-roll', [
    n(ctx, { section: 'FRONT', key: 'SPRING_RATE', label: 'Front spring', min: 0, max: 200000, step: 500, unit: 'N/m' }),
    n(ctx, { section: 'REAR', key: 'SPRING_RATE', label: 'Rear spring', min: 0, max: 200000, step: 500, unit: 'N/m' }),
    n(ctx, { section: 'ARB', key: 'FRONT', label: 'Front ARB', min: 0, max: 60000, step: 100, unit: 'N/m' }),
    n(ctx, { section: 'ARB', key: 'REAR', label: 'Rear ARB', min: 0, max: 60000, step: 100, unit: 'N/m' }),
    n(ctx, { section: 'FRONT', key: 'ROD_LENGTH', label: 'Front rod length', min: -0.2, max: 0.4, step: 0.001, unit: 'm' }),
    n(ctx, { section: 'REAR', key: 'ROD_LENGTH', label: 'Rear rod length', min: -0.2, max: 0.4, step: 0.001, unit: 'm' }),
  ]);

  const dampers = card('Dampers', [
    n(ctx, { section: 'FRONT', key: 'DAMP_BUMP', label: 'Front bump', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
    n(ctx, { section: 'FRONT', key: 'DAMP_REBOUND', label: 'Front rebound', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
    n(ctx, { section: 'REAR', key: 'DAMP_BUMP', label: 'Rear bump', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
    n(ctx, { section: 'REAR', key: 'DAMP_REBOUND', label: 'Rear rebound', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
    n(ctx, { section: 'FRONT', key: 'DAMP_FAST_BUMP', label: 'Front fast bump', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
    n(ctx, { section: 'FRONT', key: 'DAMP_FAST_REBOUND', label: 'Front fast reb.', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
    n(ctx, { section: 'REAR', key: 'DAMP_FAST_BUMP', label: 'Rear fast bump', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
    n(ctx, { section: 'REAR', key: 'DAMP_FAST_REBOUND', label: 'Rear fast reb.', min: 0, max: 20000, step: 100, unit: 'Ns/m' }),
  ]);

  const bumpstops = card('Bump stops & packers', [
    n(ctx, { section: 'FRONT', key: 'BUMP_STOP_RATE', label: 'Front rate', min: 0, max: 300000, step: 1000, unit: 'N/m' }),
    n(ctx, { section: 'REAR', key: 'BUMP_STOP_RATE', label: 'Rear rate', min: 0, max: 300000, step: 1000, unit: 'N/m' }),
    n(ctx, { section: 'FRONT', key: 'PACKER_RANGE', label: 'Front packer', min: 0, max: 0.5, step: 0.005, unit: 'm' }),
    n(ctx, { section: 'REAR', key: 'PACKER_RANGE', label: 'Rear packer', min: 0, max: 0.5, step: 0.005, unit: 'm' }),
  ]);

  refresh();

  // --- linkage / hardpoints diagram with Front/Rear toggle ------------------
  const tyres = car.ini('tyres.ini');
  const linkHost = h('div', { class: 'linkage-host' });
  let axle = 'FRONT';
  const renderLink = () => {
    clear(linkHost);
    const geom = readAxleGeom(ini, tyres, axle);
    if (!geom || !hasAnyPoint(geom)) {
      linkHost.append(h('p', { class: 'subtle' }, `No ${axle.toLowerCase()} suspension pickup points found in suspensions.ini.`));
      return;
    }
    linkHost.append(buildLinkage(geom));
  };
  const fBtn = h('button', { class: 'seg-btn active', onClick: () => setAxle('FRONT') }, 'Front');
  const rBtn = h('button', { class: 'seg-btn', onClick: () => setAxle('REAR') }, 'Rear');
  function setAxle(a) {
    axle = a;
    fBtn.classList.toggle('active', a === 'FRONT');
    rBtn.classList.toggle('active', a === 'REAR');
    renderLink();
  }
  renderLink();

  const linkageCard = h('section', { class: 'card susp-card' },
    h('div', { class: 'card-head' }, h('h3', {}, 'Suspension linkage'), h('div', { class: 'seg' }, fBtn, rBtn)),
    linkHost);

  return h('div', { class: 'panel' },
    h('section', { class: 'card susp-card' },
      h('h3', {}, 'Geometry reference'),
      diagramHost,
      h('div', { class: 'subtle small' }, 'Camber & toe angles are exaggerated for clarity; printed values are exact.')),
    linkageCard,
    h('div', { class: 'card-grid' }, [alignment, springs, dampers, bumpstops].filter(Boolean)));
}

// Read an axle's 3D pickup points (DWB or strut) for the linkage diagram.
function readAxleGeom(ini, tyres, axle) {
  if (!ini.has(axle)) return null;
  const pt = (k) => {
    const v = ini.getVector(axle, k);
    return v.length >= 3 && v[0] !== '' ? { x: +v[0], y: +v[1], z: +v[2] } : null;
  };
  return {
    type: (ini.get(axle, 'TYPE') || 'DWB').toUpperCase(),
    track: ini.getNumber(axle, 'TRACK'),
    rodLength: ini.has(axle, 'ROD_LENGTH') ? ini.getNumber(axle, 'ROD_LENGTH') : null,
    camber: ini.getNumber(axle, 'STATIC_CAMBER') || 0,
    wheelRadius: tyres && tyres.has(axle, 'RADIUS') ? tyres.getNumber(axle, 'RADIUS') : 0.3,
    pts: {
      topF: pt('WBCAR_TOP_FRONT'), topR: pt('WBCAR_TOP_REAR'),
      botF: pt('WBCAR_BOTTOM_FRONT'), botR: pt('WBCAR_BOTTOM_REAR'),
      tyreTop: pt('WBTYRE_TOP'), tyreBot: pt('WBTYRE_BOTTOM'),
      strutCar: pt('STRUT_CAR'), strutTyre: pt('STRUT_TYRE'),
      steerCar: pt('WBCAR_STEER'), steerTyre: pt('WBTYRE_STEER'),
    },
  };
}

function hasAnyPoint(geom) {
  return Object.values(geom.pts).some(Boolean);
}

function readGeom(ini) {
  const num = (s, k, d) => (ini.has(s, k) ? ini.getNumber(s, k) : d);
  return {
    type: ini.get('FRONT', 'TYPE') || 'DWB',
    rearType: ini.get('REAR', 'TYPE') || 'DWB',
    wheelbase: num('BASIC', 'WHEELBASE', 2.5),
    cg: num('BASIC', 'CG_LOCATION', 0.5),
    frontTrack: num('FRONT', 'TRACK', 1.5),
    rearTrack: num('REAR', 'TRACK', 1.5),
    frontCamber: num('FRONT', 'STATIC_CAMBER', 0),
    rearCamber: num('REAR', 'STATIC_CAMBER', 0),
    frontToe: num('FRONT', 'TOE_OUT', 0),
    rearToe: num('REAR', 'TOE_OUT', 0),
  };
}

// AC stores TOE_OUT as radians (tangent of per-wheel toe). Edit in degrees.
function toeField(car, ctx, ini, section, label) {
  if (!ini.has(section, 'TOE_OUT')) return null;
  const deg0 = (Math.atan(ini.getNumber(section, 'TOE_OUT')) * 180 / Math.PI).toFixed(2);
  const range = h('input', { type: 'range', min: -1, max: 1, step: 0.01, value: deg0 });
  const num = h('input', { type: 'number', min: -1, max: 1, step: 0.01, value: deg0, class: 'num' });
  const commit = (d) => {
    range.value = d; num.value = d;
    const rad = Math.tan((parseFloat(d) || 0) * Math.PI / 180);
    ini.set(section, 'TOE_OUT', Math.round(rad * 1e6) / 1e6);
    car.commitIni('suspensions.ini');
    ctx.markChanged();
  };
  range.addEventListener('input', () => commit(range.value));
  num.addEventListener('change', () => commit(num.value));
  return h('div', { class: 'field', title: 'Positive = toe-out, negative = toe-in (per wheel)' },
    h('label', {}, label, h('span', { class: 'unit' }, ' °')),
    h('div', { class: 'field-inputs' }, range, num));
}

// tyres.js — Tyres tab: per-compound Front/Rear editor (pressures, grip,
// dimensions, spring) from tyres.ini, with a compound switcher and a
// default-compound control. CM's __CM_*_ORIGINAL backup sections are left
// untouched by the lossless INI writer.
import { h, clear } from '../ui/dom.js';
import { card, boundNumber, boundText } from '../ui/controls.js';

export function renderTyres(car, ctx) {
  const ini = car.ini('tyres.ini');
  if (!ini) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'This car has no tyres.ini.')));
  }

  const compounds = detectCompounds(ini);
  if (!compounds.length) {
    return h('div', { class: 'panel' },
      h('section', { class: 'card' }, h('p', { class: 'subtle' }, 'No tyre compounds found in tyres.ini.')));
  }

  let sel = 0;
  const body = h('div', {});
  const renderBody = () => { clear(body); body.append(buildCompound(car, ctx, ini, compounds[sel])); };

  // compound switcher + default marker
  const btns = compounds.map((c, i) => h('button', {
    class: 'seg-btn' + (i === sel ? ' active' : ''),
    onClick: () => { sel = i; btns.forEach((b, j) => b.classList.toggle('active', j === sel)); renderBody(); updateDefault(); },
  }, c.name));

  const defaultNote = h('span', { class: 'subtle small' });
  const makeDefault = h('button', { class: 'btn ghost small-btn', onClick: () => {
    ini.set('COMPOUND_DEFAULT', 'INDEX', compounds[sel].index);
    car.commitIni('tyres.ini');
    ctx.markChanged();
    updateDefault();
  } }, 'Set as default');
  function updateDefault() {
    const di = ini.has('COMPOUND_DEFAULT', 'INDEX') ? ini.getNumber('COMPOUND_DEFAULT', 'INDEX') : 0;
    const def = compounds.find((c) => c.index === di);
    defaultNote.textContent = `Default: ${def ? def.name : di}`;
    makeDefault.disabled = compounds[sel].index === di;
  }

  renderBody();
  updateDefault();

  const header = compounds.length > 1
    ? h('div', { class: 'card-head' },
        h('h3', {}, 'Compound'),
        h('div', { class: 'tyre-compound-bar' }, h('div', { class: 'seg' }, btns), defaultNote, makeDefault))
    : null;

  return h('div', { class: 'panel' }, header, body);
}

// Compound 0 is FRONT/REAR; further compounds are FRONT_1, FRONT_2, ...
function detectCompounds(ini) {
  const out = [];
  if (ini.has('FRONT') || ini.has('REAR')) out.push({ index: 0, frontSec: 'FRONT', rearSec: 'REAR' });
  for (let n = 1; ini.has(`FRONT_${n}`) || ini.has(`REAR_${n}`); n++) {
    out.push({ index: n, frontSec: `FRONT_${n}`, rearSec: `REAR_${n}` });
  }
  for (const c of out) c.name = ini.get(c.frontSec, 'NAME') || ini.get(c.rearSec, 'NAME') || `Compound ${c.index}`;
  return out;
}

function buildCompound(car, ctx, ini, comp) {
  const axle = (sec, title) => {
    if (!ini.has(sec)) return null;
    const n = (spec) => boundNumber(car, ctx, { file: 'tyres.ini', section: sec, ...spec });
    return card(title, [
      boundText(car, ctx, { file: 'tyres.ini', section: sec, key: 'NAME', label: 'Name' }),
      boundText(car, ctx, { file: 'tyres.ini', section: sec, key: 'SHORT_NAME', label: 'Short name' }),
      n({ key: 'PRESSURE_IDEAL', label: 'Ideal pressure', min: 10, max: 50, step: 0.5, unit: 'psi' }),
      n({ key: 'PRESSURE_STATIC', label: 'Static pressure', min: 10, max: 50, step: 0.5, unit: 'psi' }),
      n({ key: 'DY_REF', label: 'Lateral grip (DY)', min: 0.5, max: 2.5, step: 0.001 }),
      n({ key: 'DX_REF', label: 'Longitudinal grip (DX)', min: 0.5, max: 2.5, step: 0.001 }),
      ...(ini.has(sec, 'RADIUS') && ini.has(sec, 'WIDTH')
        ? [tyreSizeField(car, ctx, ini, sec)]
        : [
            n({ key: 'RADIUS', label: 'Radius', min: 0.2, max: 0.55, step: 0.0005, unit: 'm' }),
            n({ key: 'WIDTH', label: 'Width', min: 0.1, max: 0.4, step: 0.005, unit: 'm' }),
          ]),
      n({ key: 'RATE', label: 'Spring rate', min: 0, max: 600000, step: 1000, unit: 'N/m' }),
      n({ key: 'ANGULAR_INERTIA', label: 'Angular inertia', min: 0, max: 5, step: 0.01 }),
    ], { keepEmpty: true });
  };
  return h('div', { class: 'card-grid' }, [axle(comp.frontSec, 'Front'), axle(comp.rearSec, 'Rear')].filter(Boolean));
}

// ---- standard tyre size <-> AC radius/width -------------------------------
// AC stores only overall RADIUS (m) and WIDTH (m). Drivers think in the tyre-
// shop format width/aspect/rim, e.g. 275/38/18 = 275 mm section width, 38 %
// aspect ratio (sidewall height as a fraction of width), 18 in rim diameter.
//   WIDTH  = width_mm / 1000
//   rim_in = RIM_RADIUS*2/0.0254 - 1            (AcTools: RIM_RADIUS is ~1" over nominal)
//   aspect = (RADIUS - (RIM_RADIUS + 0.0127)) / WIDTH * 100
// This mirrors Content Manager's "Found tyres" so the displayed size matches in-game.
const IN_TO_M = 0.0254;
const RIM_FUDGE = 0.0127;   // half-inch (radius); the AcTools RIM_RADIUS fudge factor

const aspectFor = (radiusM, widthM, rimIn) =>
  ((radiusM - (rimIn * IN_TO_M) / 2) / widthM) * 100;

// The rim/aspect split isn't recoverable from radius alone. Real-world aspect
// ratios are always multiples of 5, so for each standard rim we snap the implied
// aspect to the nearest 5 and keep the rim whose snapped size best matches the
// actual radius (within a realistic 25-82 profile range).
function decodeSize(radiusM, widthM) {
  let best = { rim: 17, aspect: 45, err: Infinity };
  for (let rim = 13; rim <= 22; rim++) {
    const raw = aspectFor(radiusM, widthM, rim);
    if (raw < 25 || raw > 82) continue;
    const aspect = Math.round(raw / 5) * 5;
    const r = (rim * IN_TO_M) / 2 + (aspect / 100) * widthM;
    const err = Math.abs(r - radiusM);
    if (err < best.err) best = { rim, aspect, err };
  }
  return best;
}

const snap5 = (n) => Math.min(85, Math.max(15, Math.round(n / 5) * 5));

const round4 = (n) => Math.round(n * 1e4) / 1e4;

function tyreSizeField(car, ctx, ini, section) {
  const radius0 = ini.getNumber(section, 'RADIUS');
  const width0 = ini.getNumber(section, 'WIDTH');
  const hasRim = ini.has(section, 'RIM_RADIUS');

  // Content Manager derives the displayed size from RIM_RADIUS, so use it when
  // present for an exact rim diameter + aspect; otherwise fall back to a guess.
  let rim0, aspect0;
  if (hasRim) {
    const rimR = ini.getNumber(section, 'RIM_RADIUS');
    rim0 = Math.round((rimR * 2) / IN_TO_M - 1);                       // CM shows 1" under RIM_RADIUS
    aspect0 = snap5(((radius0 - (rimR + RIM_FUDGE)) / width0) * 100);  // sidewall from RIM_RADIUS+0.0127
  } else {
    ({ rim: rim0, aspect: aspect0 } = decodeSize(radius0, width0));
  }

  const wIn = h('input', { type: 'number', min: 100, max: 400, step: 5, value: Math.round(width0 * 1000) });
  const aIn = h('input', { type: 'number', min: 15, max: 85, step: 5, value: aspect0 });
  const rIn = h('input', { type: 'number', min: 10, max: 24, step: 1, value: rim0 });
  const od = h('span', { class: 'tyre-od' });

  const apply = (write) => {
    const aspect = snap5(parseFloat(aIn.value) || 0);   // aspect ratio is always a multiple of 5
    aIn.value = aspect;
    const widthM = (parseFloat(wIn.value) || 0) / 1000;
    const rimIn = parseFloat(rIn.value) || 0;
    // Mirror AcTools so values round-trip with CM: RIM_RADIUS sits ~1" (diameter)
    // over nominal, and the sidewall is measured from RIM_RADIUS + 0.0127.
    const rimRadiusM = hasRim ? ((rimIn + 1) * IN_TO_M) / 2 : (rimIn * IN_TO_M) / 2;
    const radiusM = (aspect / 100) * widthM + rimRadiusM + (hasRim ? RIM_FUDGE : 0);
    od.textContent = radiusM > 0 ? `Ø ${Math.round(radiusM * 2000)} mm` : '';
    if (write) {
      ini.set(section, 'WIDTH', round4(widthM));
      ini.set(section, 'RADIUS', round4(radiusM));
      if (hasRim) ini.set(section, 'RIM_RADIUS', round4(rimRadiusM));
      car.commitIni('tyres.ini');
      ctx.markChanged();
    }
  };
  apply(false);
  for (const el of [wIn, aIn, rIn]) el.addEventListener('change', () => apply(true));

  return h('div', {
    class: 'field stacked tyre-size-field',
    title: hasRim
      ? 'Standard tyre size — width (mm) / aspect (%) / rim (in). Sets WIDTH, RADIUS and RIM_RADIUS.'
      : 'Standard tyre size — width (mm) / aspect (%) / rim (in). Sets WIDTH and RADIUS.',
  },
    h('label', {}, 'Tyre size ', h('span', { class: 'unit' }, '(W / aspect / rim)')),
    h('div', { class: 'tyre-size-row' },
      wIn, h('span', { class: 'sep' }, '/'),
      aIn, h('span', { class: 'sep' }, '/'),
      h('span', { class: 'sep rim-r' }, 'R'), rIn,
      od));
}

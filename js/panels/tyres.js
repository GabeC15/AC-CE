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
      n({ key: 'RADIUS', label: 'Radius', min: 0.2, max: 0.55, step: 0.0005, unit: 'm' }),
      n({ key: 'WIDTH', label: 'Width', min: 0.1, max: 0.4, step: 0.005, unit: 'm' }),
      n({ key: 'RATE', label: 'Spring rate', min: 0, max: 600000, step: 1000, unit: 'N/m' }),
      n({ key: 'ANGULAR_INERTIA', label: 'Angular inertia', min: 0, max: 5, step: 0.01 }),
    ], { keepEmpty: true });
  };
  return h('div', { class: 'card-grid' }, [axle(comp.frontSec, 'Front'), axle(comp.rearSec, 'Rear')].filter(Boolean));
}

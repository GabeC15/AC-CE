// overview.js — at-a-glance summary of the loaded car.
import { h } from '../ui/dom.js';
import { stat } from '../ui/controls.js';
import { runDiagnostics } from '../core/diagnostics.js';

export function renderOverview(car) {
  const ui = car.ui || {};
  const specs = ui.specs || {};
  const carIni = car.ini('car.ini');
  const engine = car.ini('engine.ini');

  const badge = h('img', { class: 'badge', alt: '' });
  car.source.readBlobUrl('ui/badge.png').then((url) => { if (url) badge.src = url; });

  return h('div', { class: 'panel' },
    h('div', { class: 'overview-head' },
      badge,
      h('div', {},
        h('h2', {}, ui.name || car.folderName),
        h('div', { class: 'subtle' }, [ui.brand, ui.year, ui.class].filter(Boolean).join(' · ')))),

    h('div', { class: 'stat-grid' },
      stat('Folder', car.folderName),
      stat('Physics', car.packed ? 'Packed (data.acd)' : 'Unpacked (data/)'),
      stat('Data files', car.entries.size),
      stat('Skins', car.skins.length),
      stat('Power', specs.bhp),
      stat('Torque', specs.torque),
      stat('Weight', specs.weight || (carIni && carIni.getNumber('BASIC', 'TOTALMASS') + ' kg')),
      stat('Top speed', specs.topspeed),
      stat('0–100', specs.acceleration),
      stat('P/W ratio', specs.pwratio),
      stat('Rev limiter', engine && engine.has('ENGINE_DATA', 'LIMITER')
        ? engine.getNumber('ENGINE_DATA', 'LIMITER') + ' rpm' : null),
      stat('Class', ui.class)),

    renderDiagnostics(car),

    ui.description ? h('section', { class: 'card' },
      h('h3', {}, 'Description'),
      h('p', { class: 'desc' }, ui.description)) : null);
}

function renderDiagnostics(car) {
  const issues = runDiagnostics(car);
  const errors = issues.filter((i) => i.level === 'error').length;
  return h('section', { class: 'card' },
    h('h3', {}, `Diagnostics${issues.length ? ` (${issues.length})` : ''}`),
    issues.length === 0
      ? h('p', { class: 'diag-ok' }, '✓ No issues found.')
      : h('div', { class: 'diag-list' }, issues.map((i) =>
          h('div', { class: 'diag-item' },
            h('span', { class: `diag-dot ${i.level}` }),
            h('span', {}, i.msg)))),
    errors ? h('p', { class: 'subtle small' }, `${errors} error(s) may prevent the car loading in-game.`) : null);
}

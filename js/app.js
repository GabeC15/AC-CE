// app.js — application controller: loading a car, tab routing, save, status.
import { h, clear, byId } from './ui/dom.js';
import { supportsFsAccess, pickCarFolder, sourceFromFileList } from './core/fsaccess.js';
import { Car } from './core/car.js';
import { renderOverview } from './panels/overview.js';
import { renderPhysics } from './panels/physics.js';
import { renderSuspension } from './panels/suspension.js';
import { renderTyres } from './panels/tyres.js';
import { renderAero } from './panels/aero.js';
import { renderUiInfo } from './panels/uiinfo.js';
import { renderSkins } from './panels/skins.js';
import { renderRawFiles } from './panels/rawfiles.js';

const TABS = [
  { id: 'overview', label: 'Overview', render: renderOverview },
  { id: 'physics', label: 'Physics', render: renderPhysics },
  { id: 'suspension', label: 'Suspension', render: renderSuspension },
  { id: 'tyres', label: 'Tyres', render: renderTyres },
  { id: 'aero', label: 'Aero & Elec', render: renderAero },
  { id: 'uiinfo', label: 'UI Info', render: renderUiInfo },
  { id: 'skins', label: 'Skins', render: renderSkins },
  { id: 'raw', label: 'Raw Files', render: renderRawFiles },
];

const state = { car: null, tab: 'overview' };
const ctx = { markChanged: () => updateDirty() };

function init() {
  byId('btn-open-folder').addEventListener('click', openViaFolder);
  byId('btn-open-upload').addEventListener('click', () => byId('upload-input').click());
  byId('upload-input').addEventListener('change', openViaUpload);
  byId('btn-save').addEventListener('click', save);

  const ab = byId('auto-backup');
  ab.checked = localStorage.getItem('acce.autoBackup') !== '0';
  ab.addEventListener('change', () => localStorage.setItem('acce.autoBackup', ab.checked ? '1' : '0'));

  if (!supportsFsAccess()) {
    byId('btn-open-folder').disabled = true;
    byId('btn-open-folder').title = 'Your browser lacks the File System Access API — use Open (upload).';
  }
  renderTabs();
  setStatus('Open a car folder to begin.');
}

async function openViaFolder() {
  try {
    const source = await pickCarFolder();
    await loadCar(source);
  } catch (err) {
    if (err && err.name === 'AbortError') return; // user cancelled
    setStatus(`Could not open folder: ${err.message}`, true);
  }
}

async function openViaUpload(e) {
  const files = e.target.files;
  if (!files || !files.length) return;
  try {
    await loadCar(sourceFromFileList(files));
  } catch (err) {
    setStatus(`Could not load car: ${err.message}`, true);
  } finally {
    e.target.value = '';
  }
}

async function loadCar(source) {
  setStatus(`Loading ${source.name}…`);
  state.car = await Car.open(source);
  byId('car-name').textContent = (state.car.ui && state.car.ui.name) || state.car.folderName;
  byId('car-sub').textContent = state.car.packed ? 'packed · data.acd' : 'unpacked · data/';
  byId('app').classList.add('loaded');
  selectTab('overview');
  updateDirty();
  const mode = source.canWriteInPlace ? 'saves in place' : 'read-only (saves download)';
  setStatus(`Loaded ${state.car.folderName} — ${state.car.entries.size} data files · ${mode}.`);
}

function renderTabs() {
  const bar = byId('tabbar');
  clear(bar);
  for (const t of TABS) {
    bar.append(h('button', {
      class: 'tab' + (t.id === state.tab ? ' active' : ''),
      onClick: () => selectTab(t.id),
    }, t.label));
  }
}

function selectTab(id) {
  state.tab = id;
  renderTabs();
  const content = clear(byId('content'));
  if (!state.car) { content.append(emptyState()); return; }
  const tab = TABS.find((t) => t.id === id);
  try {
    content.append(tab.render(state.car, ctx));
  } catch (err) {
    content.append(h('div', { class: 'panel' }, h('p', { class: 'error' }, `Panel error: ${err.message}`)));
    console.error(err);
  }
}

function updateDirty() {
  const dirty = state.car && state.car.isDirty;
  byId('btn-save').disabled = !dirty;
  byId('dirty-dot').classList.toggle('on', !!dirty);
}

async function save() {
  if (!state.car || !state.car.isDirty) return;
  try {
    byId('btn-save').disabled = true;
    const src = state.car.source;
    src.degraded = false;
    const autoBackup = byId('auto-backup')?.checked !== false;
    const { written, backupDir } = await state.car.save({ autoBackup });
    updateDirty();
    if (src.degraded) {
      setStatus(`Couldn't write to the folder (permission/sandbox blocked) — downloaded ${written.join(', ')} instead. Drop the file(s) into the car folder.`, true);
    } else if (!src.canWriteInPlace) {
      setStatus(`Saved ${written.join(', ')} (downloaded — drop into the car folder).`);
    } else {
      const bk = backupDir ? `Backed up originals to ${backupDir} · ` : '';
      setStatus(`${bk}Saved ${written.join(', ')}.`);
    }
  } catch (err) {
    setStatus(`Save failed: ${err.message}`, true);
    updateDirty();
  }
}

function emptyState() {
  return h('div', { class: 'empty' },
    h('h2', {}, 'Assetto Corsa Car Editor'),
    h('p', { class: 'subtle' }, 'Open a car folder (e.g. …/content/cars/abarth500) to edit its physics, UI info and skins.'),
    h('p', { class: 'subtle small' }, 'Packed data.acd files are unpacked and re-packed automatically — no Content Manager needed.'));
}

function setStatus(msg, isError = false) {
  const el = byId('status');
  el.textContent = msg;
  el.classList.toggle('error', isError);
}

init();

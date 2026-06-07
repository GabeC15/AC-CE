// powercurve.js — interactive torque/power chart backed by power.lut.
//
// The LUT holds the base (naturally-aspirated) torque in Nm. The chart draws the
// torque curve (editable handles) and the derived power curve, with two display
// toggles that never change the stored data:
//   - Nm / ft-lb  : torque axis & readout units
//   - Boost on/off: for turbo cars, multiply torque by (1 + boost(rpm)) using
//                   the engine.ini turbo params, so you see real (boosted) power.
// Dragging always edits the base Nm value (un-boosting on the fly when needed),
// so the LUT stays lossless and naturally-aspirated.

import { h } from './dom.js';

const HP_PER_NM_RPM = 1 / 7121;   // Nm·rpm -> hp
const NM_TO_FTLB = 0.7375621;

export function renderPowerCurve(car, ctx) {
  const text = car.entryText('power.lut');
  if (text == null) return null;
  const model = parseLut(text);
  if (model.points.length < 2) return null;

  const turbos = readTurbos(car.ini('engine.ini'));

  const canvas = h('canvas', { class: 'curve' });
  const meta = h('div', { class: 'curve-meta' });
  const torqueLegend = h('span', { class: 'legend torque' });
  const powerLegend = h('span', { class: 'legend power' }, '■ power (hp)');

  const controller = new CurveController(canvas, meta, torqueLegend, model, turbos, () => {
    car.setEntryText('power.lut', serializeLut(model));
    ctx.markChanged();
  });

  // torque unit toggle
  const nmBtn = h('button', { class: 'seg-btn', onClick: () => setUnit('Nm') }, 'Nm');
  const ftBtn = h('button', { class: 'seg-btn', onClick: () => setUnit('ft-lb') }, 'ft-lb');
  const setUnit = (u) => {
    controller.setTorqueUnit(u);
    nmBtn.classList.toggle('active', u === 'Nm');
    ftBtn.classList.toggle('active', u === 'ft-lb');
  };
  setUnit('Nm');

  const controls = [h('div', { class: 'seg' }, nmBtn, ftBtn)];

  // boost toggle (turbo cars only)
  if (turbos.length) {
    const offBtn = h('button', { class: 'seg-btn', onClick: () => setBoost(false) }, 'N/A');
    const onBtn = h('button', { class: 'seg-btn', onClick: () => setBoost(true) }, 'Boost');
    const setBoost = (on) => {
      controller.setBoost(on);
      offBtn.classList.toggle('active', !on);
      onBtn.classList.toggle('active', on);
    };
    setBoost(false);
    controls.push(h('div', { class: 'seg' }, offBtn, onBtn));
  }

  const card = h('section', { class: 'card curve-card' },
    h('div', { class: 'card-head' },
      h('h3', {}, 'Power curve ', torqueLegend, powerLegend),
      h('div', { class: 'curve-toggles' }, controls)),
    canvas, meta);

  requestAnimationFrame(() => controller.layout());
  // rAF-defer the redraw so resizing never loops within a frame.
  new ResizeObserver(() => requestAnimationFrame(() => controller.layout())).observe(canvas);
  return card;
}

// ---- turbo / boost --------------------------------------------------------

function readTurbos(eng) {
  if (!eng) return [];
  const out = [];
  for (const s of eng.sections()) {
    if (!/^TURBO_\d+$/.test(s) || !eng.has(s, 'MAX_BOOST')) continue;
    const maxBoost = eng.getNumber(s, 'MAX_BOOST') || 0;
    if (maxBoost <= 0) continue;
    out.push({
      maxBoost,
      wastegate: eng.has(s, 'WASTEGATE') ? eng.getNumber(s, 'WASTEGATE') : 0,
      refRpm: eng.has(s, 'REFERENCE_RPM') ? eng.getNumber(s, 'REFERENCE_RPM') : 0,
      gamma: eng.has(s, 'GAMMA') ? eng.getNumber(s, 'GAMMA') : 1,
    });
  }
  return out;
}

// Steady-state, full-throttle boost (bar) at an rpm, summed across turbos.
function boostAt(rpm, turbos) {
  let total = 0;
  for (const t of turbos) {
    const ratio = t.refRpm > 0 ? Math.min(1, rpm / t.refRpm) : 1;
    const raw = t.maxBoost * Math.pow(ratio, t.gamma || 1);
    const cap = t.wastegate > 0 ? Math.min(t.wastegate, t.maxBoost) : t.maxBoost;
    total += Math.min(raw, cap);
  }
  return total;
}

// ---- LUT model ------------------------------------------------------------

function parseLut(text) {
  const lines = text.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (!t || t.startsWith(';') || t.startsWith('//')) return { raw, data: false };
    const sep = t.includes('|') ? '|' : ',';
    const [a, b] = t.split(sep);
    const rpm = parseFloat(a);
    const torque = parseFloat(b);
    if (Number.isNaN(rpm) || Number.isNaN(torque)) return { raw, data: false };
    return { raw, data: true, rpm, torque, sep, changed: false };
  });
  const points = lines.filter((l) => l.data).sort((p, q) => p.rpm - q.rpm);
  return { lines, points };
}

function serializeLut(model) {
  return model.lines
    .map((l) => (l.data && l.changed ? `${l.rpm}${l.sep}${fmt(l.torque)}` : l.raw))
    .join('\n');
}

function fmt(v) {
  return String(Math.round(v * 1000) / 1000);
}

// ---- interactive canvas ---------------------------------------------------

class CurveController {
  constructor(canvas, meta, torqueLegend, model, turbos, onChange) {
    this.canvas = canvas;
    this.meta = meta;
    this.torqueLegend = torqueLegend;
    this.model = model;
    this.turbos = turbos;
    this.onChange = onChange;
    this.pad = { l: 48, r: 48, t: 14, b: 26 };
    this.drag = -1;
    this.tqUnit = 'Nm';
    this.tqFactor = 1;       // Nm -> display unit
    this.boostOn = false;

    this.maxRpm = Math.max(...model.points.map((p) => p.rpm));
    this.computeScales();

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  // displayed torque (Nm): boosted when boost mode is on
  boostFactor(rpm) { return this.boostOn ? 1 + boostAt(rpm, this.turbos) : 1; }
  disp(p) { return p.torque * this.boostFactor(p.rpm); }

  computeScales() {
    const t = this.model.points.map((p) => this.disp(p));
    const hp = this.model.points.map((p) => this.disp(p) * p.rpm * HP_PER_NM_RPM);
    this.maxNm = Math.max(...t) * 1.5 || 1;
    this.maxHp = Math.max(...hp) * 1.5 || 1;
  }

  setTorqueUnit(u) {
    this.tqUnit = u;
    this.tqFactor = u === 'ft-lb' ? NM_TO_FTLB : 1;
    this.torqueLegend.textContent = `■ torque (${u}) — drag to edit`;
    if (this.g) this.draw();
  }

  setBoost(on) {
    this.boostOn = on;
    this.computeScales();
    if (this.g) this.draw();
  }

  // projections (CSS pixels)
  x(rpm) { return this.pad.l + (rpm / this.maxRpm) * (this.W - this.pad.l - this.pad.r); }
  yNm(nm) { return this.H - this.pad.b - (nm / this.maxNm) * (this.H - this.pad.t - this.pad.b); }
  yHp(hp) { return this.H - this.pad.b - (hp / this.maxHp) * (this.H - this.pad.t - this.pad.b); }
  nmFromY(py) {
    const nm = ((this.H - this.pad.b - py) / (this.H - this.pad.t - this.pad.b)) * this.maxNm;
    return Math.max(0, Math.min(this.maxNm, nm));
  }

  layout() {
    const dpr = window.devicePixelRatio || 1;
    this.W = this.canvas.clientWidth || 600;
    this.H = 240;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.height = this.H + 'px';
    this.g = this.canvas.getContext('2d');
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  pointerPos(e) {
    const r = this.canvas.getBoundingClientRect();
    return { px: e.clientX - r.left, py: e.clientY - r.top };
  }

  hitTest(px, py) {
    let best = -1, bestDist = 14;
    this.model.points.forEach((p, i) => {
      const d = Math.hypot(this.x(p.rpm) - px, this.yNm(this.disp(p)) - py);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  }

  onDown(e) {
    const { px, py } = this.pointerPos(e);
    const i = this.hitTest(px, py);
    if (i < 0) return;
    this.drag = i;
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    this.canvas.classList.add('grabbing');
  }

  onMove(e) {
    const { px, py } = this.pointerPos(e);
    if (this.drag < 0) {
      this.canvas.style.cursor = this.hitTest(px, py) >= 0 ? 'grab' : 'default';
      return;
    }
    const p = this.model.points[this.drag];
    // nmFromY is the displayed (possibly boosted) torque; store the base value.
    const base = this.nmFromY(py) / this.boostFactor(p.rpm);
    p.torque = Math.round(base * 1000) / 1000;
    p.changed = true;
    this.draw();
  }

  onUp(e) {
    if (this.drag < 0) return;
    this.drag = -1;
    this.canvas.classList.remove('grabbing');
    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    this.onChange();
  }

  draw() {
    const g = this.g, { l, r, t, b } = this.pad, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    g.font = '10px system-ui, sans-serif';
    g.lineWidth = 1;

    // grid + x labels (rpm)
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i <= 5; i++) {
      const gx = l + (i / 5) * (W - l - r);
      g.beginPath(); g.moveTo(gx, t); g.lineTo(gx, H - b); g.stroke();
      g.fillText(Math.round((i / 5) * this.maxRpm), gx - 10, H - b + 14);
    }
    // y labels: torque (left, display unit), power (right, hp)
    for (let i = 0; i <= 4; i++) {
      const ty = t + (i / 4) * (H - t - b);
      g.fillStyle = '#ff9f43';
      g.fillText(Math.round((1 - i / 4) * this.maxNm * this.tqFactor), 6, ty + 3);
      g.fillStyle = '#54a0ff';
      g.fillText(Math.round((1 - i / 4) * this.maxHp), W - r + 8, ty + 3);
    }

    const pts = this.model.points;
    // power line
    g.strokeStyle = '#54a0ff'; g.lineWidth = 2; g.beginPath();
    pts.forEach((p, i) => {
      const X = this.x(p.rpm), Y = this.yHp(this.disp(p) * p.rpm * HP_PER_NM_RPM);
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    });
    g.stroke();
    // torque line + handles
    g.strokeStyle = '#ff9f43'; g.lineWidth = 2; g.beginPath();
    pts.forEach((p, i) => { const X = this.x(p.rpm), Y = this.yNm(this.disp(p)); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
    g.stroke();
    g.fillStyle = '#ff9f43';
    pts.forEach((p) => {
      g.beginPath(); g.arc(this.x(p.rpm), this.yNm(this.disp(p)), 3.5, 0, Math.PI * 2); g.fill();
    });

    this.updateMeta();
  }

  updateMeta() {
    const pts = this.model.points;
    const pkT = pts.reduce((m, p) => (this.disp(p) > this.disp(m) ? p : m), pts[0]);
    const pkP = pts.reduce((m, p) => {
      const hp = this.disp(p) * p.rpm * HP_PER_NM_RPM;
      return hp > m.hp ? { hp, rpm: p.rpm } : m;
    }, { hp: 0, rpm: 0 });
    const boostNote = this.boostOn
      ? `   ·   boost to ${(boostAt(this.maxRpm, this.turbos)).toFixed(2)} bar`
      : '';
    this.meta.textContent =
      `Peak torque ${Math.round(this.disp(pkT) * this.tqFactor)} ${this.tqUnit} @ ${Math.round(pkT.rpm)} rpm   ·   ` +
      `Peak power ${Math.round(pkP.hp)} hp @ ${Math.round(pkP.rpm)} rpm${boostNote}`;
  }
}

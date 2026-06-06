// powercurve.js — interactive torque/power chart backed by power.lut.
//
// Renders the torque curve (editable) and the derived power curve. Each torque
// sample is a draggable handle; dragging rewrites that point's value. The LUT is
// edited losslessly — comments, blank lines and untouched samples keep their
// exact original text; only dragged samples are reformatted.

import { h } from './dom.js';

const HP_PER_NM_RPM = 1 / 7121; // Nm·rpm -> hp

export function renderPowerCurve(car, ctx) {
  const text = car.entryText('power.lut');
  if (text == null) return null;
  const model = parseLut(text);
  if (model.points.length < 2) return null;

  const canvas = h('canvas', { class: 'curve' });
  const meta = h('div', { class: 'curve-meta' });
  const card = h('section', { class: 'card curve-card' },
    h('h3', {}, 'Power curve ',
      h('span', { class: 'legend torque' }, '■ torque (Nm) — drag to edit'),
      h('span', { class: 'legend power' }, '■ power (hp)')),
    canvas, meta);

  const controller = new CurveController(canvas, meta, model, () => {
    car.setEntryText('power.lut', serializeLut(model));
    ctx.markChanged();
  });
  requestAnimationFrame(() => controller.layout());
  // rAF-defer the redraw so resizing never loops within a frame.
  new ResizeObserver(() => requestAnimationFrame(() => controller.layout())).observe(canvas);
  return card;
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
  constructor(canvas, meta, model, onChange) {
    this.canvas = canvas;
    this.meta = meta;
    this.model = model;
    this.onChange = onChange;
    this.pad = { l: 48, r: 48, t: 14, b: 26 };
    this.drag = -1;

    const initMaxNm = Math.max(...model.points.map((p) => p.torque));
    const initMaxHp = Math.max(...model.points.map((p) => p.torque * p.rpm * HP_PER_NM_RPM));
    this.maxRpm = Math.max(...model.points.map((p) => p.rpm));
    this.maxNm = initMaxNm * 1.5;
    this.maxHp = initMaxHp * 1.5;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
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
      const d = Math.hypot(this.x(p.rpm) - px, this.yNm(p.torque) - py);
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
    p.torque = Math.round(this.nmFromY(py) * 1000) / 1000;
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
    // y labels: torque (left), power (right)
    for (let i = 0; i <= 4; i++) {
      const ty = t + (i / 4) * (H - t - b);
      g.fillStyle = '#ff9f43';
      g.fillText(Math.round((1 - i / 4) * this.maxNm), 6, ty + 3);
      g.fillStyle = '#54a0ff';
      g.fillText(Math.round((1 - i / 4) * this.maxHp), W - r + 8, ty + 3);
    }

    const pts = this.model.points;
    // power line
    g.strokeStyle = '#54a0ff'; g.lineWidth = 2; g.beginPath();
    pts.forEach((p, i) => {
      const X = this.x(p.rpm), Y = this.yHp(p.torque * p.rpm * HP_PER_NM_RPM);
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    });
    g.stroke();
    // torque line + handles
    g.strokeStyle = '#ff9f43'; g.lineWidth = 2; g.beginPath();
    pts.forEach((p, i) => { const X = this.x(p.rpm), Y = this.yNm(p.torque); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
    g.stroke();
    g.fillStyle = '#ff9f43';
    pts.forEach((p) => {
      g.beginPath(); g.arc(this.x(p.rpm), this.yNm(p.torque), 3.5, 0, Math.PI * 2); g.fill();
    });

    this.updateMeta();
  }

  updateMeta() {
    const pts = this.model.points;
    const pkT = pts.reduce((m, p) => (p.torque > m.torque ? p : m), pts[0]);
    const pkP = pts.reduce((m, p) => {
      const hp = p.torque * p.rpm * HP_PER_NM_RPM;
      return hp > m.hp ? { hp, rpm: p.rpm } : m;
    }, { hp: 0, rpm: 0 });
    this.meta.textContent =
      `Peak torque ${Math.round(pkT.torque)} Nm @ ${Math.round(pkT.rpm)} rpm   ·   ` +
      `Peak power ${Math.round(pkP.hp)} hp @ ${Math.round(pkP.rpm)} rpm`;
  }
}

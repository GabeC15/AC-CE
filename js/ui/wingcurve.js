// wingcurve.js — interactive CL (lift) and CD (drag) vs angle-of-attack chart
// for one wing, backed by its LUT_AOA_CL / LUT_AOA_CD files. CL uses the left
// axis (orange), CD the right axis (blue); both sets of points are draggable and
// write back losslessly to their respective .lut entries.

import { h } from './dom.js';
import { parseLut, serializeLut, fmtNum } from '../core/lut.js';

const DPR = () => window.devicePixelRatio || 1;

export function buildWingCurve(car, ctx, { label, clName, cdName, clGain, cdGain }) {
  const series = [];
  if (clName && car.hasEntry(clName)) series.push(mkSeries('CL', '#ff9f43', 'left', clName));
  if (cdName && car.hasEntry(cdName)) series.push(mkSeries('CD', '#54a0ff', 'right', cdName));
  if (!series.length) return null;

  function mkSeries(key, color, axis, file) {
    return { key, color, axis, file, model: parseLut(car.entryText(file)) };
  }

  const canvas = h('canvas', { class: 'curve wing-canvas' });
  const meta = h('div', { class: 'curve-meta' });
  const card = h('section', { class: 'card' },
    h('h3', {}, `${label} — CL / CD vs AoA`,
      series.map((s) => h('span', { class: 'legend', style: { color: s.color, marginLeft: '12px' } },
        `■ ${s.key}${s.key === 'CL' ? ` ×${clGain ?? 1}` : ` ×${cdGain ?? 1}`}`))),
    canvas, meta);

  const ctrl = new WingController(canvas, meta, series, () => {
    for (const s of series) car.setEntryText(s.file, serializeLut(s.model));
    ctx.markChanged();
  });
  requestAnimationFrame(() => ctrl.layout());
  new ResizeObserver(() => ctrl.layout()).observe(canvas);
  return card;
}

class WingController {
  constructor(canvas, meta, series, onChange) {
    this.canvas = canvas;
    this.meta = meta;
    this.series = series;
    this.onChange = onChange;
    this.pad = { l: 46, r: 46, t: 14, b: 28 };
    this.drag = null;

    // x axis (AoA) spans the union of both series
    const xs = series.flatMap((s) => s.model.points.map((p) => p.x));
    this.xMin = Math.min(...xs); this.xMax = Math.max(...xs);
    for (const s of series) s.axis === 'left' ? (this.left = axisFor(s)) : (this.right = axisFor(s));

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  axis(name) { return name === 'left' ? this.left : this.right; }
  X(x) { return this.pad.l + ((x - this.xMin) / ((this.xMax - this.xMin) || 1)) * (this.W - this.pad.l - this.pad.r); }
  Y(v, ax) { return this.H - this.pad.b - ((v - ax.min) / ((ax.max - ax.min) || 1)) * (this.H - this.pad.t - this.pad.b); }
  invY(py, ax) { return ax.min + ((this.H - this.pad.b - py) / ((this.H - this.pad.t - this.pad.b) || 1)) * (ax.max - ax.min); }

  layout() {
    const dpr = DPR();
    this.W = this.canvas.clientWidth || 600;
    this.H = 220;
    this.canvas.width = this.W * dpr;
    this.canvas.height = this.H * dpr;
    this.canvas.style.height = this.H + 'px';
    this.g = this.canvas.getContext('2d');
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.draw();
  }

  pos(e) { const r = this.canvas.getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; }

  hit(px, py) {
    let best = null, bestD = 13;
    for (const s of this.series) {
      const ax = this.axis(s.axis);
      for (const p of s.model.points) {
        const d = Math.hypot(this.X(p.x) - px, this.Y(p.y, ax) - py);
        if (d < bestD) { bestD = d; best = { s, p }; }
      }
    }
    return best;
  }

  onDown(e) {
    const { px, py } = this.pos(e);
    const hit = this.hit(px, py);
    if (!hit) return;
    this.drag = hit;
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}
    this.canvas.classList.add('grabbing');
  }

  onMove(e) {
    const { px, py } = this.pos(e);
    if (!this.drag) { this.canvas.style.cursor = this.hit(px, py) ? 'grab' : 'default'; return; }
    const ax = this.axis(this.drag.s.axis);
    this.drag.p.y = Math.round(this.invY(py, ax) * 1e5) / 1e5;
    this.drag.p.changed = true;
    this.draw();
  }

  onUp(e) {
    if (!this.drag) return;
    this.drag = null;
    this.canvas.classList.remove('grabbing');
    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}
    this.onChange();
  }

  draw() {
    const g = this.g, { l, r, t, b } = this.pad, W = this.W, H = this.H;
    g.clearRect(0, 0, W, H);
    g.font = '10px system-ui, sans-serif';
    g.lineWidth = 1;

    // x grid + AoA labels
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i <= 5; i++) {
      const gx = l + (i / 5) * (W - l - r);
      g.beginPath(); g.moveTo(gx, t); g.lineTo(gx, H - b); g.stroke();
      g.fillText(Math.round(this.xMin + (i / 5) * (this.xMax - this.xMin)) + '°', gx - 8, H - b + 14);
    }
    // axis tick labels
    if (this.left) this.axisLabels(this.left, 6, 'left');
    if (this.right) this.axisLabels(this.right, W - r + 8, 'right');

    // zero line for CL (if it crosses)
    if (this.left && this.left.min < 0 && this.left.max > 0) {
      const zy = this.Y(0, this.left);
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(l, zy); g.lineTo(W - r, zy); g.stroke();
    }

    for (const s of this.series) {
      const ax = this.axis(s.axis);
      g.strokeStyle = s.color; g.lineWidth = 2; g.beginPath();
      s.model.points.forEach((p, i) => { const X = this.X(p.x), Y = this.Y(p.y, ax); i ? g.lineTo(X, Y) : g.moveTo(X, Y); });
      g.stroke();
      g.fillStyle = s.color;
      for (const p of s.model.points) { g.beginPath(); g.arc(this.X(p.x), this.Y(p.y, ax), 3.5, 0, Math.PI * 2); g.fill(); }
    }
    this.updateMeta();
  }

  axisLabels(ax, x, side) {
    const g = this.g;
    g.fillStyle = side === 'left' ? '#ff9f43' : '#54a0ff';
    for (let i = 0; i <= 4; i++) {
      const v = ax.max - (i / 4) * (ax.max - ax.min);
      g.fillText(v.toFixed(2), x, this.pad.t + (i / 4) * (this.H - this.pad.t - this.pad.b) + 3);
    }
  }

  updateMeta() {
    this.meta.textContent = this.series.map((s) => {
      const ys = s.model.points.map((p) => p.y);
      const peak = s.key === 'CD' ? Math.max(...ys) : Math.max(...ys.map(Math.abs));
      return `${s.key} peak ${fmtNum(peak)}`;
    }).join('   ·   ') + '   (drag points to edit)';
  }
}

function axisFor(s) {
  const ys = s.model.points.map((p) => p.y);
  let min = Math.min(0, ...ys), max = Math.max(0, ...ys);
  const span = (max - min) || 0.2;
  return { min: min - span * 0.15, max: max + span * 0.15 };
}

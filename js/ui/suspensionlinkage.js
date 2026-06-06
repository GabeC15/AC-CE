// suspensionlinkage.js — draws a car's real suspension hardpoints from
// suspensions.ini as two to-scale projections:
//   front view (X-Y): control arms, upright, wheel + camber, kingpin inclination
//   side view  (Z-Y): wishbone fore/aft spread, caster, ride-height reference
//
// Handles double-wishbone (WBCAR_*/WBTYRE_*) and MacPherson strut (STRUT_*).
// Caster and KPI are computed from the steering axis (lower ball joint -> upper
// pivot), so they reflect the actual geometry, not a typed-in number.
//
// Coordinate convention (per corner, metres): x = lateral (inboard +),
// y = vertical (up +), z = longitudinal (front of car +).

const SVGNS = 'http://www.w3.org/2000/svg';
const DEG = 180 / Math.PI;

function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);

/**
 * @param {object} g axle geometry from the panel (see readAxleGeom)
 * @returns {HTMLElement}
 */
/** Caster & kingpin inclination (deg) from the steering axis (lower ball joint -> upper pivot). */
export function casterKpi(pts, type) {
  const lower = pts.tyreBot;
  const upper = type === 'STRUT' ? pts.strutCar : pts.tyreTop;
  if (!lower || !upper) return { caster: null, kpi: null, lower, upper };
  return {
    lower, upper,
    caster: Math.atan2(lower.z - upper.z, upper.y - lower.y) * DEG,
    kpi: Math.atan2(upper.x - lower.x, upper.y - lower.y) * DEG,
  };
}

export function buildLinkage(g) {
  const p = g.pts;
  const segs = [];          // [a, b, isAxis]
  const marks = [];         // labelled points
  const add = (pt) => pt && marks.push(pt);

  if (g.type === 'STRUT') {
    pushSeg(segs, p.strutCar, p.strutTyre);
    pushSeg(segs, p.botF, p.tyreBot);
    pushSeg(segs, p.botR, p.tyreBot);
    [p.strutCar, p.strutTyre, p.botF, p.botR, p.tyreBot].forEach(add);
  } else {
    pushSeg(segs, p.topF, p.tyreTop);
    pushSeg(segs, p.topR, p.tyreTop);
    pushSeg(segs, p.botF, p.tyreBot);
    pushSeg(segs, p.botR, p.tyreBot);
    [p.topF, p.topR, p.botF, p.botR, p.tyreTop, p.tyreBot].forEach(add);
  }

  const { kpi, lower, upper } = casterKpi(p, g.type);
  if (lower && upper) segs.push([lower, upper, true]);

  const allPts = segs.flatMap(([a, b]) => [a, b]);
  const frontView = buildView(allPts, segs, marks, g, 'x', 'y', { wheel: 'rect', label: kpi != null ? `KPI ${f1(kpi)}°` : '' });
  const topView = buildView(allPts, segs, marks, g, 'x', 'z', { wheel: 'top', dir: 'front ↑' });
  const sideView = buildView(allPts, segs, marks, g, 'z', 'y', { wheel: 'circle', dir: 'front →' });

  const readout = (k, v) => h2('div', 'link-stat', h2('span', 'link-stat-k', k), h2('span', 'link-stat-v', v));
  const stats = h2('div', 'link-stats',
    readout('Type', g.type),
    kpi != null ? readout('KPI', `${f1(kpi)}°`) : null,
    g.rodLength != null ? readout('Rod length', `${g.rodLength} m`) : null,
    readout('Wheel Ø', `${(g.wheelRadius * 2).toFixed(2)} m`));

  return h2('div', 'linkage',
    h2('div', 'linkage-views',
      labelled('Front view', frontView),
      labelled('Top view', topView),
      labelled('Side view', sideView)),
    stats,
    h2('div', 'subtle small', 'Pickup points read straight from suspensions.ini. Heights are vs wheel centre; actual ride height is derived in-sim from springs, mass and rod length. Caster is on the Geometry reference.'));
}

function buildView(allPts, segs, marks, g, hk, vk, opts) {
  const W = 280, H = 230, pad = 26;
  const r = g.wheelRadius;
  // bounds include hardpoints and the wheel envelope
  const hs = allPts.map((p) => p[hk]).concat([-r * 0.7, r * 0.7, 0]);
  const vs = allPts.map((p) => p[vk]).concat([-r, r]);
  const minH = Math.min(...hs), maxH = Math.max(...hs);
  const minV = Math.min(...vs), maxV = Math.max(...vs);
  const spanH = (maxH - minH) || 0.2, spanV = (maxV - minV) || 0.2;
  const scale = Math.min((W - 2 * pad) / spanH, (H - 2 * pad) / spanV);
  const offH = pad + ((W - 2 * pad) - spanH * scale) / 2;
  const offV = pad + ((H - 2 * pad) - spanV * scale) / 2;
  const X = (p) => offH + (p[hk] - minH) * scale;
  const Y = (p) => H - (offV + (p[vk] - minV) * scale);
  const xRaw = (v) => offH + (v - minH) * scale;
  const yRaw = (v) => H - (offV + (v - minV) * scale);

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'linkage-svg', preserveAspectRatio: 'xMidYMid meet' });

  // ground (only meaningful when the vertical axis is height)
  if (vk === 'y') svg.append(s('line', { x1: 6, y1: yRaw(-r), x2: W - 6, y2: yRaw(-r), class: 'link-ground' }));

  // wheel at the corner reference (h = 0)
  const cx = xRaw(0), cy = yRaw(0);
  if (opts.wheel === 'circle') {
    svg.append(s('circle', { cx, cy, r: r * scale, class: 'link-wheel' }));
    svg.append(s('circle', { cx, cy, r: r * scale * 0.45, class: 'link-wheel-rim' }));
  } else if (opts.wheel === 'top') {
    // tyre footprint seen from above: tread width (x) by contact length (z)
    const wPx = 0.20 * scale, lPx = 0.30 * scale;
    svg.append(s('rect', { x: cx - wPx / 2, y: cy - lPx / 2, width: wPx, height: lPx, rx: 3, class: 'link-wheel' }));
  } else {
    const wPx = 0.18 * scale, hPx = 2 * r * scale;
    svg.append(s('g', { transform: `rotate(${-(g.camber || 0)} ${cx} ${cy})` },
      s('rect', { x: cx - wPx / 2, y: cy - hPx / 2, width: wPx, height: hPx, rx: 3, class: 'link-wheel' })));
  }

  // linkage segments
  for (const [a, b, axis] of segs) {
    svg.append(s('line', { x1: X(a), y1: Y(a), x2: X(b), y2: Y(b), class: axis ? 'link-axis' : 'link-arm' }));
  }
  // hardpoint dots
  for (const m of marks) svg.append(s('circle', { cx: X(m), cy: Y(m), r: 3, class: 'link-point' }));

  if (opts.label) svg.append(s('text', { x: 8, y: 16, class: 'link-angle' }, opts.label));
  if (opts.dir) svg.append(s('text', { x: W - 8, y: H - 8, class: 'link-dir' }, opts.dir));
  return svg;
}

function pushSeg(segs, a, b) { if (a && b) segs.push([a, b, false]); }

function labelled(title, node) {
  return h2('figure', 'linkage-fig', node, h2('figcaption', '', title));
}

// tiny non-SVG element helper (kept local to avoid SVG/HTML namespace mixups)
function h2(tag, cls, ...kids) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

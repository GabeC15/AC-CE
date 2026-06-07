// suspensiondiagram.js — live SVG geometry reference for the Suspension tab.
//
// Draws a top-down schematic (wheelbase, front/rear track, CG / weight
// distribution, per-wheel toe) and two front-view camber gauges. Everything is
// derived from the current suspensions.ini values and redrawn whenever they
// change, so it's a reference you can tune against in real time.
//
// Visual angles for camber and toe are exaggerated for legibility; the printed
// numbers are always the true values.

const SVGNS = 'http://www.w3.org/2000/svg';

function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

/**
 * @param {{type,rearType,wheelbase,cg,frontTrack,rearTrack,
 *          frontCamber,rearCamber,frontToe,rearToe}} g geometry values
 * @returns {SVGSVGElement}
 */
export function buildSuspensionDiagram(g) {
  const svg = s('svg', { viewBox: '0 0 640 300', class: 'susp-svg', preserveAspectRatio: 'xMidYMid meet' });

  drawTopDown(svg, g);
  drawCamberGauge(svg, 290, 36, 'Front', { stat: g.frontCamber, loaded: g.frontLoaded, gain: g.frontGain });
  drawCamberGauge(svg, 290, 168, 'Rear', { stat: g.rearCamber, loaded: g.rearLoaded, gain: g.rearGain });
  drawCasterGauge(svg, 466, 36, 'Front', g.frontCaster);
  drawCasterGauge(svg, 466, 168, 'Rear', g.rearCaster);

  return svg;
}

function drawTopDown(svg, g) {
  const cx = 150;
  const maxTrack = Math.max(g.frontTrack, g.rearTrack, 0.1);
  // tyre dimensions (m); fall back to sensible defaults
  const fR = g.frontRadius || 0.3, rR = g.rearRadius || 0.3;
  const fW = g.frontWidth || 0.2, rW = g.rearWidth || 0.2;
  const maxR = Math.max(fR, rR), maxW = Math.max(fW, rW);

  // One scale (m -> px) drives wheelbase, track AND wheel size, so the whole
  // top view is dimensionally accurate. The budget includes wheel overhang so
  // nothing clips top/bottom.
  const vTop = 54, vBottom = 280, areaW = 150;
  const scale = Math.min((vBottom - vTop) / (Math.max(g.wheelbase, 0.1) + 2 * maxR), areaW / (maxTrack + maxW));

  const frontY = vTop + fR * scale;
  const wb = g.wheelbase * scale;
  const rearY = frontY + wb;
  const hf = (g.frontTrack * scale) / 2;
  const hr = (g.rearTrack * scale) / 2;

  // chassis hint (sits between the wheels)
  const bodyHalf = Math.max(hf, hr) * 0.55;
  svg.append(s('path', {
    d: `M ${cx - bodyHalf} ${frontY - 8} Q ${cx} ${frontY - 20} ${cx + bodyHalf} ${frontY - 8}
        L ${cx + bodyHalf} ${rearY + 6} Q ${cx} ${rearY + 16} ${cx - bodyHalf} ${rearY + 6} Z`,
    class: 'susp-body',
  }));
  // axles + centreline
  svg.append(s('line', { x1: cx - hf, y1: frontY, x2: cx + hf, y2: frontY, class: 'susp-axle' }));
  svg.append(s('line', { x1: cx - hr, y1: rearY, x2: cx + hr, y2: rearY, class: 'susp-axle' }));
  svg.append(s('line', { x1: cx, y1: frontY, x2: cx, y2: rearY, class: 'susp-axle' }));

  // wheels sized to tyre width x diameter, toe-rotated, mirrored L/R
  const toeDeg = (t) => Math.max(-22, Math.min(22, Math.atan(t) * (180 / Math.PI) * 40));
  wheel(svg, cx - hf, frontY, -toeDeg(g.frontToe), fW * scale, 2 * fR * scale);
  wheel(svg, cx + hf, frontY, toeDeg(g.frontToe), fW * scale, 2 * fR * scale);
  wheel(svg, cx - hr, rearY, -toeDeg(g.rearToe), rW * scale, 2 * rR * scale);
  wheel(svg, cx + hr, rearY, toeDeg(g.rearToe), rW * scale, 2 * rR * scale);

  // CG marker: distance behind front axle = (1 - frontWeight) * wheelbase
  const cgY = frontY + (1 - g.cg) * wb;
  svg.append(s('line', { x1: cx - 10, y1: cgY, x2: cx + 10, y2: cgY, class: 'susp-cg-line' }));
  svg.append(s('line', { x1: cx, y1: cgY - 10, x2: cx, y2: cgY + 10, class: 'susp-cg-line' }));
  svg.append(s('circle', { cx, cy: cgY, r: 5, class: 'susp-cg' }));
  svg.append(s('text', { x: cx + 12, y: cgY + 4, class: 'susp-label' },
    `${Math.round(g.cg * 100)}% F · ${Math.round((1 - g.cg) * 100)}% R`));

  // dimensions, placed clear of the wheels
  const wbX = cx - Math.max(hf, hr) - maxW * scale / 2 - 18;
  dim(svg, wbX, frontY, wbX, rearY, 'v', `${f2(g.wheelbase)} m`);
  dim(svg, cx - hf, frontY - fR * scale - 11, cx + hf, frontY - fR * scale - 11, 'h', `${f2(g.frontTrack)} m`);
  dim(svg, cx - hr, rearY + rR * scale + 11, cx + hr, rearY + rR * scale + 11, 'h', `${f2(g.rearTrack)} m`);

  svg.append(s('text', { x: cx, y: 14, class: 'susp-title' }, 'Top view'));
  svg.append(s('text', { x: cx, y: 28, class: 'susp-sub' }, `${g.type} front · ${g.rearType} rear`));
}

function wheel(svg, x, y, angleDeg, wPx, hPx) {
  svg.append(s('g', { transform: `rotate(${angleDeg} ${x} ${y})` },
    s('rect', { x: x - wPx / 2, y: y - hPx / 2, width: wPx, height: hPx, rx: Math.min(4, wPx / 2), class: 'susp-wheel' })));
}

// front-view camber gauge: a pair of wheels tilted by camber (exaggerated)
function drawCamberGauge(svg, x0, y0, label, info) {
  const w = 164, h = 120;
  const groundY = y0 + h - 30;
  const cxL = x0 + 50, cxR = x0 + w - 50;
  const stat = info.stat;
  const shown = info.loaded != null ? info.loaded : stat;   // show loaded when we have it
  svg.append(s('rect', { x: x0, y: y0, width: w, height: h, rx: 8, class: 'susp-gauge-bg' }));
  svg.append(s('text', { x: x0 + 12, y: y0 + 20, class: 'susp-gauge-title' }, `${label} camber`));
  svg.append(s('text', { x: x0 + w - 12, y: y0 + 20, class: 'susp-angle-val' }, `${f2(shown)}°`));
  svg.append(s('line', { x1: x0 + 14, y1: groundY, x2: x0 + w - 14, y2: groundY, class: 'susp-ground' }));

  const ex = Math.max(-20, Math.min(20, shown * 4));
  camberWheel(svg, cxL, groundY, -ex);   // left wheel
  camberWheel(svg, cxR, groundY, ex);    // right wheel

  if (info.loaded != null) {
    const gainTxt = info.gain != null ? ` · ${f2(info.gain)}°/cm` : '';
    svg.append(s('text', { x: x0 + 12, y: y0 + h - 7, class: 'susp-gauge-sub' }, `loaded · setup ${f2(stat)}°${gainTxt}`));
  }
}

// side-view caster gauge: wheel + true-vertical reference + tilted coilover/steering axis.
// Front of the vehicle is to the left, so positive caster leans the strut top rearward (right).
function drawCasterGauge(svg, x0, y0, label, caster) {
  const w = 164, h = 120;
  svg.append(s('rect', { x: x0, y: y0, width: w, height: h, rx: 8, class: 'susp-gauge-bg' }));
  svg.append(s('text', { x: x0 + 12, y: y0 + 20, class: 'susp-gauge-title' }, `${label} caster`));
  if (caster != null) svg.append(s('text', { x: x0 + w - 12, y: y0 + 20, class: 'susp-angle-val' }, `${f2(caster)}°`));

  const cx = x0 + w / 2, cy = y0 + 66, R = 27;
  const groundY = cy + R;
  // true-vertical reference through the wheel centre
  svg.append(s('line', { x1: cx, y1: cy - R - 24, x2: cx, y2: groundY + 6, class: 'susp-vert-ref' }));
  // side-view wheel: tyre ring + rim
  svg.append(s('circle', { cx, cy, r: R, class: 'susp-caster-wheel' }));
  svg.append(s('circle', { cx, cy, r: R * 0.42, class: 'susp-caster-rim' }));

  // steering axis + coilover strut, pivoting at the contact patch
  const ang = Math.max(-26, Math.min(26, (caster || 0) * 3));
  const strut = s('g', { transform: `rotate(${ang} ${cx} ${groundY})` });
  strut.append(s('line', { x1: cx, y1: groundY + 2, x2: cx, y2: cy - R - 20, class: 'susp-caster-axis' }));
  const coil = [];
  let yy = cy - R + 2;
  for (let i = 0; i < 5; i++) { coil.push(`${cx - 5},${yy}`, `${cx + 5},${yy - 3}`); yy -= 6; }
  strut.append(s('polyline', { points: coil.join(' '), class: 'susp-caster-spring' }));
  strut.append(s('rect', { x: cx - 6, y: cy - R - 26, width: 12, height: 4, rx: 1, class: 'susp-caster-mount' }));
  svg.append(strut);

  svg.append(s('text', { x: x0 + 12, y: y0 + h - 8, class: 'susp-front-dir' }, '← front'));
}

function camberWheel(svg, x, groundY, angleDeg) {
  const top = groundY - 46;
  // true-vertical reference at the contact patch
  svg.append(s('line', { x1: x, y1: groundY + 3, x2: x, y2: top - 4, class: 'susp-vert-ref' }));
  // leaning wheel (ring) + blue tilt axis, pivoting at the contact patch
  svg.append(s('g', { transform: `rotate(${angleDeg} ${x} ${groundY})` },
    s('rect', { x: x - 7, y: top, width: 14, height: 46, rx: 3, class: 'susp-camber-wheel' }),
    s('line', { x1: x, y1: groundY - 3, x2: x, y2: top + 3, class: 'susp-caster-axis' })));
}

// dimension line with end ticks and centered label
function dim(svg, x1, y1, x2, y2, orient, label) {
  svg.append(s('line', { x1, y1, x2, y2, class: 'susp-dim' }));
  if (orient === 'v') {
    svg.append(s('line', { x1: x1 - 4, y1, x2: x1 + 4, y2: y1, class: 'susp-dim' }));
    svg.append(s('line', { x1: x2 - 4, y1: y2, x2: x2 + 4, y2: y2, class: 'susp-dim' }));
    svg.append(s('text', { x: x1 - 6, y: (y1 + y2) / 2, class: 'susp-dim-label', transform: `rotate(-90 ${x1 - 6} ${(y1 + y2) / 2})` }, label));
  } else {
    svg.append(s('line', { x1, y1: y1 - 4, x2: x1, y2: y1 + 4, class: 'susp-dim' }));
    svg.append(s('line', { x1: x2, y1: y2 - 4, x2: x2, y2: y2 + 4, class: 'susp-dim' }));
    svg.append(s('text', { x: (x1 + x2) / 2, y: y1 - 5, class: 'susp-dim-label' }, label));
  }
}

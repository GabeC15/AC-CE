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
  const svg = s('svg', { viewBox: '0 0 560 300', class: 'susp-svg', preserveAspectRatio: 'xMidYMid meet' });

  drawTopDown(svg, g);
  drawCamberGauge(svg, 330, 36, 'Front', g.frontCamber, g.frontToe);
  drawCamberGauge(svg, 330, 168, 'Rear', g.rearCamber, g.rearToe);

  return svg;
}

function drawTopDown(svg, g) {
  const cx = 150, topY = 62;
  const areaH = 200, areaW = 150;
  // Shared scale (m -> px) so wheelbase and track keep true proportions.
  const maxTrack = Math.max(g.frontTrack, g.rearTrack, 0.1);
  const scale = Math.min(areaH / Math.max(g.wheelbase, 0.1), areaW / maxTrack);

  const wb = g.wheelbase * scale;
  const frontY = topY, rearY = topY + wb;
  const hf = (g.frontTrack * scale) / 2;
  const hr = (g.rearTrack * scale) / 2;

  // chassis hint
  const bodyHalf = Math.max(hf, hr) * 0.62;
  svg.append(s('path', {
    d: `M ${cx - bodyHalf} ${frontY - 22} Q ${cx} ${frontY - 34} ${cx + bodyHalf} ${frontY - 22}
        L ${cx + bodyHalf} ${rearY + 18} Q ${cx} ${rearY + 26} ${cx - bodyHalf} ${rearY + 18} Z`,
    class: 'susp-body',
  }));
  // axles
  svg.append(s('line', { x1: cx - hf, y1: frontY, x2: cx + hf, y2: frontY, class: 'susp-axle' }));
  svg.append(s('line', { x1: cx - hr, y1: rearY, x2: cx + hr, y2: rearY, class: 'susp-axle' }));
  svg.append(s('line', { x1: cx, y1: frontY, x2: cx, y2: rearY, class: 'susp-axle' }));

  // wheels (toe exaggerated; left/right mirror)
  const toeDeg = (t) => Math.max(-22, Math.min(22, Math.atan(t) * (180 / Math.PI) * 40));
  wheel(svg, cx - hf, frontY, -toeDeg(g.frontToe));
  wheel(svg, cx + hf, frontY, toeDeg(g.frontToe));
  wheel(svg, cx - hr, rearY, -toeDeg(g.rearToe));
  wheel(svg, cx + hr, rearY, toeDeg(g.rearToe));

  // CG marker: distance behind front axle = (1 - frontWeight) * wheelbase
  const cgY = frontY + (1 - g.cg) * wb;
  svg.append(s('line', { x1: cx - 10, y1: cgY, x2: cx + 10, y2: cgY, class: 'susp-cg-line' }));
  svg.append(s('line', { x1: cx, y1: cgY - 10, x2: cx, y2: cgY + 10, class: 'susp-cg-line' }));
  svg.append(s('circle', { cx, cy: cgY, r: 5, class: 'susp-cg' }));
  svg.append(s('text', { x: cx + 12, y: cgY + 4, class: 'susp-label' },
    `${Math.round(g.cg * 100)}% F · ${Math.round((1 - g.cg) * 100)}% R`));

  // dimensions
  // wheelbase (left vertical)
  const wbX = cx - Math.max(hf, hr) - 26;
  dim(svg, wbX, frontY, wbX, rearY, 'v', `${f2(g.wheelbase)} m`);
  // front track (above), rear track (below)
  dim(svg, cx - hf, frontY - 16, cx + hf, frontY - 16, 'h', `${f2(g.frontTrack)} m`);
  dim(svg, cx - hr, rearY + 16, cx + hr, rearY + 16, 'h', `${f2(g.rearTrack)} m`);

  svg.append(s('text', { x: cx, y: 14, class: 'susp-title' }, 'Top view'));
  svg.append(s('text', { x: cx, y: 28, class: 'susp-sub' }, `${g.type} front · ${g.rearType} rear`));
}

function wheel(svg, x, y, angleDeg) {
  svg.append(s('g', { transform: `rotate(${angleDeg} ${x} ${y})` },
    s('rect', { x: x - 5, y: y - 11, width: 10, height: 22, rx: 2.5, class: 'susp-wheel' })));
}

// front-view camber gauge: a pair of wheels tilted by camber (exaggerated)
function drawCamberGauge(svg, x0, y0, label, camber, toe) {
  const w = 200, h = 120;
  const groundY = y0 + h - 26;
  const cxL = x0 + 64, cxR = x0 + w - 64;
  svg.append(s('rect', { x: x0, y: y0, width: w, height: h, rx: 8, class: 'susp-gauge-bg' }));
  svg.append(s('text', { x: x0 + 12, y: y0 + 20, class: 'susp-gauge-title' }, `${label} camber`));
  svg.append(s('text', { x: x0 + w - 12, y: y0 + 20, class: 'susp-gauge-val' }, `${f2(camber)}°`));
  svg.append(s('line', { x1: x0 + 16, y1: groundY, x2: x0 + w - 16, y2: groundY, class: 'susp-ground' }));

  const ex = Math.max(-20, Math.min(20, camber * 4));
  camberWheel(svg, cxL, groundY, -ex);   // left wheel
  camberWheel(svg, cxR, groundY, ex);    // right wheel
}

function camberWheel(svg, x, groundY, angleDeg) {
  const top = groundY - 46;
  svg.append(s('g', { transform: `rotate(${angleDeg} ${x} ${groundY})` },
    s('rect', { x: x - 7, y: top, width: 14, height: 46, rx: 3, class: 'susp-wheel' })));
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

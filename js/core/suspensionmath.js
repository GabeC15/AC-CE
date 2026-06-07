// suspensionmath.js — 3D suspension kinematics for camber gain and an estimated
// loaded (dynamic) camber. Each ball joint swings about its true 3D wishbone
// axis (the line through the two car-side pickups), the upright length is held
// constant, and camber is read as the upright's lateral tilt. Pure (no DOM) so
// it can be unit-tested in Node.
//
// Loaded camber ≈ static camber + camber_gain × suspension_compression, where
// compression = sprung corner weight / spring rate. It's an estimate: the exact
// in-game figure also depends on AC's solver, motion ratio and setup ride
// height, so treat it as ~±0.5°, not frame-exact.

const G = 9.81;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const unit = (a) => scl(a, 1 / (len(a) || 1));
const v3 = (p) => (p ? [p.x, p.y, p.z] : null);

// A ball joint swinging about the axis through A,B, passing through P0 at angle 0.
function arc(A, B, P0) {
  const u = unit(sub(B, A));
  const C = add(A, scl(u, dot(sub(P0, A), u)));     // foot of P0 on the axis
  const r = len(sub(P0, C));
  const e1 = unit(sub(P0, C));
  const e2 = cross(u, e1);
  return { at: (phi) => add(C, add(scl(e1, r * Math.cos(phi)), scl(e2, r * Math.sin(phi)))), C, r, e1, e2 };
}

// Build a state(phi) -> { camber(my sign, deg), wheelY } for one axle, or null.
function builder(pts, type) {
  const tyreBot = v3(pts.tyreBot);
  if (!tyreBot) return null;
  const low = (pts.botF && pts.botR) ? arc(v3(pts.botF), v3(pts.botR), tyreBot) : null;
  if (!low) return null;

  if (type === 'STRUT') {
    const strutCar = v3(pts.strutCar);
    if (!strutCar) return null;
    return (phi) => {
      const Lt = low.at(phi);
      return { camber: Math.atan2(strutCar[0] - Lt[0], strutCar[1] - Lt[1]) * 180 / Math.PI, wheelY: Lt[1] };
    };
  }

  // double wishbone
  const tyreTop = v3(pts.tyreTop);
  if (!tyreTop || !pts.topF || !pts.topR) return null;
  const up = arc(v3(pts.topF), v3(pts.topR), tyreTop);
  const d = len(sub(tyreTop, tyreBot));
  const solveUpper = (Lt) => {
    const Q = sub(up.C, Lt);
    const a = dot(Q, up.e1), b = dot(Q, up.e2);
    const amp = Math.hypot(a, b);
    if (amp === 0) return null;
    const K = (d * d - dot(Q, Q) - up.r * up.r) / (2 * up.r);
    if (Math.abs(K) > amp) return null;                  // mechanism at its limit
    const base = Math.atan2(b, a), off = Math.acos(K / amp);
    const norm = (x) => Math.abs(((x + Math.PI) % (2 * Math.PI)) - Math.PI);
    return norm(base + off) < norm(base - off) ? base + off : base - off; // root nearest 0
  };
  return (phi) => {
    const Lt = low.at(phi);
    const phiU = solveUpper(Lt);
    if (phiU == null) return null;
    const Ut = up.at(phiU);
    return { camber: Math.atan2(Ut[0] - Lt[0], Ut[1] - Lt[1]) * 180 / Math.PI, wheelY: (Ut[1] + Lt[1]) / 2 };
  };
}

/**
 * Camber gain in AC's sign convention (deg per metre of bump/compression);
 * negative = camber goes more negative as the suspension compresses.
 * @returns {number|null}
 */
export function camberGainPerM(axle) {
  const state = builder(axle.pts, axle.type);
  if (!state) return null;
  const base = state(0);
  if (!base) return null;
  const dir = (state(0.01)?.wheelY ?? base.wheelY) > base.wheelY ? 1 : -1; // +phi that raises the wheel
  const sp = state(dir * 0.01), sm = state(-dir * 0.01);
  if (!sp || !sm || sp.wheelY === sm.wheelY) return null;
  const gainMine = (sp.camber - sm.camber) / (sp.wheelY - sm.wheelY); // my sign, deg/m
  return -gainMine; // AC sign
}

/**
 * Estimate loaded camber at the resting ride height under the car's weight.
 * @param {object} axle  { pts, type, staticCamber, springRate, hubMass }
 * @param {number} cornerMassKg  static corner mass (sprung + unsprung)
 * @returns {{loaded:number, gainPerCm:number, compressionMm:number}|null}
 */
export function loadedCamber(axle, cornerMassKg) {
  const gain = camberGainPerM(axle);
  if (gain == null || !axle.springRate || !cornerMassKg) return null;
  const unsprung = axle.hubMass || 0;
  const comp = Math.max(0, cornerMassKg - unsprung) * G / axle.springRate; // metres
  return {
    loaded: axle.staticCamber + gain * comp,
    gainPerCm: gain / 100,
    compressionMm: comp * 1000,
  };
}

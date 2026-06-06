// lut.js — lossless parser/serializer for Assetto Corsa `.lut` files.
//
// LUT files are `x|y` (or `x,y`) per line, e.g. an AoA->CL aero curve or an
// rpm->torque power curve. Parsing keeps every original line; serializing only
// rewrites the points that actually changed, so edits stay minimal and any
// comments/spacing survive untouched.

/** @returns {{lines:object[], points:{x:number,y:number,sep:string,changed:boolean,raw:string,data:boolean}[]}} */
export function parseLut(text) {
  const lines = text.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (!t || t.startsWith(';') || t.startsWith('//')) return { raw, data: false };
    const sep = t.includes('|') ? '|' : ',';
    const [a, b] = t.split(sep);
    const x = parseFloat(a);
    const y = parseFloat(b);
    if (Number.isNaN(x) || Number.isNaN(y)) return { raw, data: false };
    return { raw, data: true, x, y, sep, changed: false };
  });
  const points = lines.filter((l) => l.data).sort((p, q) => p.x - q.x);
  return { lines, points };
}

export function serializeLut(model) {
  return model.lines
    .map((l) => (l.data && l.changed ? `${l.x}${l.sep}${fmtNum(l.y)}` : l.raw))
    .join('\n');
}

export function fmtNum(v) {
  return String(Math.round(v * 1e5) / 1e5);
}

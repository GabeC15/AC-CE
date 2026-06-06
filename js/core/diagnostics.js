// diagnostics.js — scans a loaded car for likely problems: physically
// implausible values, cross-file inconsistencies, and broken .lut references.
// Returns a flat list of { level, msg } where level is 'error' | 'warn'.

export function runDiagnostics(car) {
  const issues = [];
  const add = (level, msg) => issues.push({ level, msg });
  const ini = (name) => (car.hasEntry(name) ? car.ini(name) : null);

  // --- engine sanity -------------------------------------------------------
  const eng = ini('engine.ini');
  if (eng) {
    const lim = eng.getNumber('ENGINE_DATA', 'LIMITER');
    const idle = eng.getNumber('ENGINE_DATA', 'MINIMUM');
    if (lim != null && idle != null && lim <= idle) add('error', `Rev limiter (${lim}) is not above idle (${idle}).`);
    if (lim != null && (lim < 1000 || lim > 20000)) add('warn', `Rev limiter ${lim} rpm looks out of range.`);
  }

  // --- mass & fuel ---------------------------------------------------------
  const carIni = ini('car.ini');
  if (carIni) {
    const mass = carIni.getNumber('BASIC', 'TOTALMASS');
    if (mass != null && (mass < 100 || mass > 5000)) add('warn', `Total mass ${mass} kg looks unusual.`);
    const fuel = carIni.getNumber('FUEL', 'FUEL');
    const maxFuel = carIni.getNumber('FUEL', 'MAX_FUEL');
    if (fuel != null && maxFuel != null && fuel > maxFuel) add('warn', `Starting fuel (${fuel} L) exceeds max fuel (${maxFuel} L).`);
  }

  // --- brakes & balance ----------------------------------------------------
  const brakes = ini('brakes.ini');
  if (brakes) {
    const share = brakes.getNumber('DATA', 'FRONT_SHARE');
    if (share != null && (share < 0 || share > 1)) add('error', `Brake front bias ${share} must be between 0 and 1.`);
  }
  const sus = ini('suspensions.ini');
  if (sus) {
    const cg = sus.getNumber('BASIC', 'CG_LOCATION');
    if (cg != null && (cg < 0 || cg > 1)) add('error', `Weight distribution ${cg} must be between 0 and 1.`);
  }

  // --- critical files present ---------------------------------------------
  for (const f of ['car.ini', 'engine.ini', 'tyres.ini', 'suspensions.ini', 'drivetrain.ini']) {
    if (!car.hasEntry(f)) add('warn', `Missing ${f}.`);
  }

  // --- broken .lut references across every ini ----------------------------
  for (const name of car.entryNames()) {
    if (!name.toLowerCase().endsWith('.ini')) continue;
    let parsed;
    try { parsed = car.ini(name); } catch { continue; }
    if (!parsed) continue;
    for (const section of parsed.sections()) {
      for (const key of parsed.keys(section)) {
        const v = (parsed.get(section, key) || '').trim();
        if (/\.lut$/i.test(v) && !car.hasEntry(v)) {
          add('warn', `${name} [${section}] ${key} → missing file "${v}".`);
        }
      }
    }
  }

  return issues;
}

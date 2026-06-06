// physics.js — structured editors for the core physics files, plus a power
// curve chart drawn from power.lut. Controls bind directly to the parsed INI
// and skip themselves when a car lacks the relevant key.
import { h } from '../ui/dom.js';
import { card, boundNumber } from '../ui/controls.js';
import { renderPowerCurve } from '../ui/powercurve.js';

export function renderPhysics(car, ctx) {
  const n = (spec) => boundNumber(car, ctx, spec);

  const massFuel = card('Mass & Fuel', [
    n({ file: 'car.ini', section: 'BASIC', key: 'TOTALMASS', label: 'Total mass', min: 400, max: 3000, step: 5, unit: 'kg' }),
    n({ file: 'car.ini', section: 'FUEL', key: 'FUEL', label: 'Starting fuel', min: 0, max: 200, step: 1, unit: 'L' }),
    n({ file: 'car.ini', section: 'FUEL', key: 'MAX_FUEL', label: 'Max fuel', min: 0, max: 200, step: 1, unit: 'L' }),
  ]);

  const engine = card('Engine', [
    n({ file: 'engine.ini', section: 'ENGINE_DATA', key: 'LIMITER', label: 'Rev limiter', min: 2000, max: 14000, step: 100, unit: 'rpm' }),
    n({ file: 'engine.ini', section: 'ENGINE_DATA', key: 'MINIMUM', label: 'Idle', min: 500, max: 3000, step: 50, unit: 'rpm' }),
    n({ file: 'engine.ini', section: 'ENGINE_DATA', key: 'INERTIA', label: 'Inertia', min: 0, max: 1, step: 0.001 }),
    n({ file: 'engine.ini', section: 'TURBO_0', key: 'MAX_BOOST', label: 'Turbo max boost', min: 0, max: 5, step: 0.01, unit: 'bar' }),
    n({ file: 'engine.ini', section: 'TURBO_0', key: 'WASTEGATE', label: 'Wastegate', min: 0, max: 5, step: 0.01, unit: 'bar' }),
  ]);

  const drivetrain = card('Drivetrain', [
    n({ file: 'drivetrain.ini', section: 'DIFFERENTIAL', key: 'POWER', label: 'Diff power', min: 0, max: 1, step: 0.01 }),
    n({ file: 'drivetrain.ini', section: 'DIFFERENTIAL', key: 'COAST', label: 'Diff coast', min: 0, max: 1, step: 0.01 }),
    n({ file: 'drivetrain.ini', section: 'CLUTCH', key: 'MAX_TORQUE', label: 'Clutch torque', min: 0, max: 2000, step: 10, unit: 'Nm' }),
  ]);

  const brakes = card('Brakes', [
    n({ file: 'brakes.ini', section: 'DATA', key: 'MAX_TORQUE', label: 'Max brake torque', min: 200, max: 8000, step: 50, unit: 'Nm' }),
    n({ file: 'brakes.ini', section: 'DATA', key: 'FRONT_SHARE', label: 'Front bias', min: 0, max: 1, step: 0.01 }),
    n({ file: 'brakes.ini', section: 'DATA', key: 'HANDBRAKE_TORQUE', label: 'Handbrake torque', min: 0, max: 5000, step: 50, unit: 'Nm' }),
  ]);

  const tyres = card('Tyres', [
    n({ file: 'tyres.ini', section: 'FRONT', key: 'PRESSURE_IDEAL', label: 'Front ideal PSI', min: 10, max: 50, step: 0.5, unit: 'psi' }),
    n({ file: 'tyres.ini', section: 'REAR', key: 'PRESSURE_IDEAL', label: 'Rear ideal PSI', min: 10, max: 50, step: 0.5, unit: 'psi' }),
    n({ file: 'tyres.ini', section: 'FRONT', key: 'PRESSURE_STATIC', label: 'Front static PSI', min: 10, max: 50, step: 0.5, unit: 'psi' }),
    n({ file: 'tyres.ini', section: 'REAR', key: 'PRESSURE_STATIC', label: 'Rear static PSI', min: 10, max: 50, step: 0.5, unit: 'psi' }),
  ]);

  const steering = card('Steering', [
    n({ file: 'car.ini', section: 'CONTROLS', key: 'STEER_LOCK', label: 'Steer lock', min: 60, max: 720, step: 1, unit: '°' }),
    n({ file: 'car.ini', section: 'CONTROLS', key: 'STEER_RATIO', label: 'Steer ratio', min: 5, max: 30, step: 0.5 }),
  ]);

  return h('div', { class: 'panel' },
    renderPowerCurve(car, ctx),
    renderGears(car, ctx),
    h('div', { class: 'card-grid' },
      [massFuel, engine, drivetrain, brakes, tyres, steering].filter(Boolean)));
}

function renderGears(car, ctx) {
  const ini = car.ini('drivetrain.ini');
  if (!ini || !ini.has('GEARS')) return null;
  const fields = ini.keys('GEARS').map((key) => boundNumber(car, ctx, {
    file: 'drivetrain.ini', section: 'GEARS', key,
    label: key.replace('GEAR_', 'Gear ').replace('_', ' '),
    min: key === 'COUNT' ? 1 : 0, max: key === 'COUNT' ? 8 : 7, step: key === 'COUNT' ? 1 : 0.001,
  }));
  return card('Gear ratios', fields);
}

// (Power-curve rendering now lives in ../ui/powercurve.js.)

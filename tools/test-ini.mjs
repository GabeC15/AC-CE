// Validate the INI parser against real AC data unpacked from abarth500.
// Usage: node tools/test-ini.mjs [pathToCarFolder]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { unpack } from '../js/core/acd.js';
import { IniFile } from '../js/core/ini.js';

const carDir = process.argv[2]
  || 'D:/SteamLibrary/steamapps/common/assettocorsa/content/cars/abarth500';
const folderName = basename(carDir);
const td = new TextDecoder('utf-8');

const entries = unpack(readFileSync(`${carDir}/data.acd`), folderName);
const text = (name) => td.decode(entries.find((e) => e.name.toLowerCase() === name).data);

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log(`✓ ${msg}`); } else { console.error(`❌ FAIL: ${msg}`); failures++; }
}

// 1) Lossless round-trip on every .ini entry.
let losslessAll = true;
let checked = 0;
for (const e of entries) {
  if (!e.name.toLowerCase().endsWith('.ini')) continue;
  const original = td.decode(e.data);
  const round = new IniFile(original).serialize();
  if (round !== original) {
    losslessAll = false;
    console.error(`   not lossless: ${e.name}`);
  }
  checked++;
}
assert(losslessAll, `lossless round-trip on all ${checked} .ini files`);

// 2) Reads expected values from car.ini.
const car = new IniFile(text('car.ini'));
assert(car.getNumber('BASIC', 'TOTALMASS') === 1100, 'car.ini BASIC/TOTALMASS = 1100');
assert(car.get('INFO', 'SCREEN_NAME') === 'Abarth 500 SS', 'car.ini INFO/SCREEN_NAME');
const inertia = car.getVector('BASIC', 'INERTIA');
assert(inertia.length === 3 && inertia[0] === '1.6', 'car.ini BASIC/INERTIA parses as vector');

// 3) set() changes only the value and preserves the inline comment + tabs.
const massLineBefore = new IniFile(text('car.ini')).lines.find(
  (l) => l.type === 'pair' && l.key === 'TOTALMASS');
const edited = new IniFile(text('car.ini'));
edited.set('BASIC', 'TOTALMASS', 1150);
const massLineAfter = edited.lines.find((l) => l.type === 'pair' && l.key === 'TOTALMASS');
assert(massLineAfter.raw.startsWith('TOTALMASS=1150'), 'set() updates the value');
assert(massLineAfter.tail === massLineBefore.tail && massLineAfter.tail.includes('mass in kg'),
  'set() preserves the inline comment and tab alignment');
assert(edited.serialize().split('\n').length === text('car.ini').split('\n').length,
  'set() does not add or remove lines');

// 4a) Gears are keys inside [GEARS] (GEAR_1=ratio, COUNT, FINAL).
const drive = new IniFile(text('drivetrain.ini'));
assert(drive.getNumber('GEARS', 'COUNT') >= 4, 'drivetrain GEARS/COUNT read');
assert(drive.getNumber('GEARS', 'GEAR_1') > 0 && drive.has('GEARS', 'FINAL'),
  'drivetrain gear ratios read as keys in [GEARS]');

// 4b) indexedSections() handles genuine indexed sections (aero wings).
const aero = new IniFile(text('aero.ini'));
const wings = aero.indexedSections('WING_');
assert(wings.length === 3 && wings[0] === 'WING_0',
  `aero WING_n indexed sections found (${wings.join(',')})`);

// 5) Inserting a brand-new key/section works and is readable back.
const ins = new IniFile('[A]\nX=1\n');
ins.set('A', 'Y', 2);
ins.set('NEW', 'Z', 3);
assert(ins.get('A', 'Y') === '2' && ins.get('NEW', 'Z') === '3', 'insert new key and new section');

console.log(failures === 0 ? '\n✅ All INI checks passed.' : `\n❌ ${failures} INI check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

// Validate the ACD codec against a real, encrypted Kunos car.
// Usage: node tools/test-acd.mjs [pathToCarFolder]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { unpack, pack, deriveKey } from '../js/core/acd.js';

const carDir = process.argv[2]
  || 'D:/SteamLibrary/steamapps/common/assettocorsa/content/cars/abarth500';
const folderName = basename(carDir);

console.log(`Car folder : ${folderName}`);
console.log(`Derived key: ${deriveKey(folderName)}`);

const raw = readFileSync(`${carDir}/data.acd`);
console.log(`data.acd   : ${raw.length} bytes\n`);

// 1) Unpack the real file and show what we got.
const entries = unpack(raw, folderName);
console.log(`Unpacked ${entries.length} entries:`);
for (const e of entries) console.log(`  ${e.name.padEnd(28)} ${e.data.length} bytes`);

// 2) Prove the decrypted bytes are real text: dump the start of car.ini.
const td = new TextDecoder('utf-8');
const carIni = entries.find((e) => e.name.toLowerCase() === 'car.ini');
if (carIni) {
  console.log('\n--- car.ini (first 400 chars) ---');
  console.log(td.decode(carIni.data).slice(0, 400));
  console.log('--- end ---');
}

// 3) Sanity checks: decrypted content must look like AC INI/data.
function assert(cond, msg) {
  if (!cond) { console.error(`\n❌ FAIL: ${msg}`); process.exit(1); }
  console.log(`✓ ${msg}`);
}
console.log('');
assert(entries.length > 0, 'at least one entry unpacked');
assert(carIni && td.decode(carIni.data).includes('[HEADER]'), 'car.ini contains [HEADER] section');
const engine = entries.find((e) => e.name.toLowerCase() === 'engine.ini');
assert(engine && td.decode(engine.data).includes('[ENGINE_DATA]'), 'engine.ini contains [ENGINE_DATA]');
const allPrintable = entries.every((e) => {
  if (e.data.length === 0) return true; // empty files (e.g. drs.ini) are valid
  const s = td.decode(e.data);
  // INI/LUT files are text; allow the odd non-ASCII but require mostly printable.
  let printable = 0;
  for (const ch of s) if (ch >= ' ' || ch === '\n' || ch === '\r' || ch === '\t') printable++;
  return printable / s.length > 0.95;
});
assert(allPrintable, 'all entries decrypt to predominantly-printable text');

// 4) Round-trip: pack then unpack must reproduce every entry exactly.
const repacked = pack(entries, folderName);
const reentries = unpack(repacked, folderName);
assert(reentries.length === entries.length, 'round-trip preserves entry count');
let identical = true;
for (let i = 0; i < entries.length; i++) {
  const a = entries[i], b = reentries[i];
  if (a.name !== b.name || a.data.length !== b.data.length) { identical = false; break; }
  for (let j = 0; j < a.data.length; j++) if (a.data[j] !== b.data[j]) { identical = false; break; }
}
assert(identical, 'round-trip (pack -> unpack) reproduces all entries byte-for-byte');

console.log('\n✅ All ACD codec checks passed.');

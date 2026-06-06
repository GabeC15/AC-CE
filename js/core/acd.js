// acd.js — Assetto Corsa `data.acd` codec (unpack / pack).
//
// Pure ES module with zero dependencies; runs unchanged in the browser and in
// Node (used by the test harness in tools/). Operates entirely on bytes —
// text<->bytes conversion is the caller's job.
//
// Format (reverse-engineered; matches gro-ove/actools, which Content Manager
// itself is built on):
//
//   [optional header]  int32 == -1111  then int32 version   (else: no header)
//   per entry, repeated until EOF:
//     int32  nameLength
//     bytes  name              (ASCII, `nameLength` bytes)
//     int32  dataLength        (number of *source* bytes)
//     bytes  data              (`dataLength` * 4 bytes: each source byte is
//                               stored as [encByte, 0, 0, 0])
//
// Each content byte is obfuscated by adding the char code of one character of
// the key string, cycling through the key by byte index:
//
//     enc[i] = (src[i] + key.charCodeAt(i % key.length)) & 0xff
//
// The key string is "p1-p2-...-p8", eight bytes derived from the *car folder
// name* (e.g. "abarth500"). Writers omit the header (so does actools/CM); the
// game reads headered and header-less files alike.

/**
 * Derive the obfuscation key from a car's folder name.
 *
 * The eight parts multiply character codes into very large intermediates, so
 * the whole computation runs in BigInt to match the original arbitrary-
 * precision integer math exactly; each part is reduced mod 256 only at the end.
 * BigInt division truncates toward zero, which is what the reference algorithm's
 * manual sign handling also does.
 *
 * @param {string} folderName car folder name, e.g. "abarth500"
 * @returns {string} key string like "12-34-...-200"
 */
export function deriveKey(folderName) {
  const L = folderName.length;
  const c = (i) => BigInt(folderName.charCodeAt(i));
  const byte = (x) => Number(((x % 256n) + 256n) % 256n);

  // PART 1 — sum of all char codes.
  let p1 = 0n;
  for (let i = 0; i < L; i++) p1 += c(i);

  // PART 2 — alternating multiply/subtract over consecutive pairs.
  let p2 = 0n;
  for (let i = 0; i < L - 1; ) {
    p2 = p2 * c(i); i++;
    p2 = p2 - c(i); i++;
  }

  // PART 3 — multiply, integer-divide, then offset; index steps by 3.
  let p3 = 0n;
  for (let i = 1; i < L - 3; i += 3) {
    p3 = p3 * c(i);
    p3 = p3 / (c(i + 1) + 0x1bn);
    p3 = p3 + (-0x1bn - c(i - 1));
  }

  // PART 4 — running subtraction from a constant.
  let p4 = 0x1683n;
  for (let i = 1; i < L; i++) p4 -= c(i);

  // PART 5 — nested multiply with neighbour char; index steps by 4.
  let p5 = 0x42n;
  for (let i = 1; i < L - 4; i += 4) {
    const a = p5 * (c(i) + 0xfn);
    p5 = (c(i - 1) + 0xfn) * a + 0x16n;
  }

  // PART 6 — subtract every other char.
  let p6 = 0x65n;
  for (let i = 0; i < L - 2; i += 2) p6 -= c(i);

  // PART 7 — running modulo by every other char.
  let p7 = 0xabn;
  for (let i = 0; i < L - 2; i += 2) p7 = p7 % c(i);

  // PART 8 — divide then add the next char.
  let p8 = 0xabn;
  for (let i = 0; i < L - 1; i++) {
    p8 = p8 / c(i);
    p8 = p8 + c(i + 1);
  }

  return [p1, p2, p3, p4, p5, p6, p7, p8].map(byte).join('-');
}

/**
 * Unpack a `data.acd` buffer into a list of entries.
 *
 * @param {ArrayBuffer|Uint8Array} buffer raw data.acd bytes
 * @param {string} folderName car folder name used to derive the key
 * @returns {{name: string, data: Uint8Array}[]} decrypted entries
 */
export function unpack(buffer, folderName) {
  const u8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const key = deriveKey(folderName);
  let pos = 0;
  const readInt32 = () => { const v = dv.getInt32(pos, true); pos += 4; return v; };

  // Optional 8-byte header: sentinel (-1111) + version. Otherwise rewind.
  if (u8.length >= 4 && readInt32() === -1111) {
    readInt32();
  } else {
    pos = 0;
  }

  const entries = [];
  while (pos < u8.length) {
    const nameLen = readInt32();
    let name = '';
    for (let i = 0; i < nameLen; i++) name += String.fromCharCode(u8[pos++]);

    const dataLen = readInt32();
    const data = new Uint8Array(dataLen);
    for (let i = 0; i < dataLen; i++) {
      const enc = u8[pos];      // real byte; following 3 are padding
      pos += 4;
      data[i] = (enc - key.charCodeAt(i % key.length)) & 0xff;
    }
    entries.push({ name, data });
  }
  return entries;
}

/**
 * Pack a list of entries into `data.acd` bytes (header-less, game-compatible).
 *
 * @param {{name: string, data: Uint8Array}[]} entries entries to write
 * @param {string} folderName car folder name used to derive the key
 * @returns {Uint8Array} packed data.acd bytes
 */
export function pack(entries, folderName) {
  const key = deriveKey(folderName);

  let total = 0;
  for (const e of entries) total += 4 + e.name.length + 4 + e.data.length * 4;

  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let pos = 0;
  const writeInt32 = (v) => { dv.setInt32(pos, v, true); pos += 4; };

  for (const e of entries) {
    writeInt32(e.name.length);
    for (let i = 0; i < e.name.length; i++) out[pos++] = e.name.charCodeAt(i) & 0xff;

    writeInt32(e.data.length);
    for (let i = 0; i < e.data.length; i++) {
      out[pos] = (e.data[i] + key.charCodeAt(i % key.length)) & 0xff;
      pos += 4; // leave the 3 padding bytes as zero
    }
  }
  return out;
}

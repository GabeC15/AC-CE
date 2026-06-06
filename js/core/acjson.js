// acjson.js — tolerant reader/writer for Assetto Corsa's ui_*.json files.
//
// AC's ui_car.json is frequently *invalid* JSON: a UTF-8 BOM up front, raw
// newlines and tabs inside the "description" string, and the occasional
// trailing comma. Strict JSON.parse throws on all of these. This sanitizer
// walks the text tracking whether we're inside a string and escapes control
// characters there, so the real content (including multi-line descriptions)
// survives instead of being thrown away.

/** Parse AC json text into an object, tolerating common malformations. */
export function parseAcJson(text) {
  return JSON.parse(sanitize(text));
}

/** Like parseAcJson but returns `fallback` instead of throwing. */
export function tryParseAcJson(text, fallback = {}) {
  try { return parseAcJson(text); } catch { return fallback; }
}

/**
 * Serialize back to text. AC and Content Manager use tab indentation; we match
 * that so saved files look native and diff cleanly against the original.
 */
export function stringifyAcJson(obj) {
  return JSON.stringify(obj, null, '\t');
}

function sanitize(text) {
  // Drop a leading BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = text.charCodeAt(i);

    if (escaped) { out += ch; escaped = false; continue; }
    if (ch === '\\') { out += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }

    if (inString && code < 0x20) {
      // Control char inside a string: escape so JSON stays valid.
      out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : ' ';
      continue;
    }
    out += ch;
  }

  // Remove trailing commas before } or ].
  return out.replace(/,(\s*[}\]])/g, '$1');
}

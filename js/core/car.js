// car.js — the in-memory model of one Assetto Corsa car.
//
// Ties the codec (acd), the INI parser (ini) and a CarSource (fsaccess)
// together. Loads physics from data.acd (or an unpacked data/ folder), parses
// ui/ui_car.json, enumerates skins, tracks edits, and saves everything back.

import { unpack, pack } from './acd.js';
import { IniFile } from './ini.js';
import { tryParseAcJson, stringifyAcJson } from './acjson.js';

const td = new TextDecoder('utf-8');
const te = new TextEncoder();

export class Car {
  constructor(source) {
    this.source = source;
    this.folderName = source.name;
    this.packed = false;                 // true: physics live in data.acd
    /** @type {Map<string,{name:string,data:Uint8Array}>} lowercase name -> entry */
    this.entries = new Map();
    this._ini = new Map();               // lowercase name -> IniFile (lazy)
    this._dirtyData = new Set();         // entry names with edited bytes
    this.ui = null;                      // parsed ui_car.json (or null)
    this._uiDirty = false;
    this._backupDone = false;            // originals backed up this session?
    this.skins = [];                     // { name, previewUrl, ui }
    this._dirtySkins = new Set();        // skin folder names with edited ui_skin.json
  }

  static async open(source) {
    const car = new Car(source);
    await car._loadPhysics();
    await car._loadUi();
    await car._loadSkins();
    return car;
  }

  async _loadPhysics() {
    if (await this.source.exists('data.acd')) {
      this.packed = true;
      const raw = await this.source.readBytes('data.acd');
      for (const e of unpack(raw, this.folderName)) {
        this.entries.set(e.name.toLowerCase(), e);
      }
    } else if ((await this.source.listDir('data')).length) {
      this.packed = false;
      for (const item of await this.source.listDir('data')) {
        if (item.kind !== 'file') continue;
        const data = await this.source.readBytes(`data/${item.name}`);
        if (data) this.entries.set(item.name.toLowerCase(), { name: item.name, data });
      }
    }
  }

  async _loadUi() {
    if (await this.source.exists('ui/ui_car.json')) {
      const bytes = await this.source.readBytes('ui/ui_car.json');
      this._uiText = td.decode(bytes);
      this.ui = tryParseAcJson(this._uiText, null);
    }
  }

  async _loadSkins() {
    for (const item of await this.source.listDir('skins')) {
      if (item.kind !== 'directory') continue;
      let previewUrl = null;
      for (const candidate of ['preview.jpg', 'preview.png', 'Preview.jpg']) {
        if (await this.source.exists(`skins/${item.name}/${candidate}`)) {
          previewUrl = await this.source.readBlobUrl(`skins/${item.name}/${candidate}`);
          break;
        }
      }
      let ui = null;
      if (await this.source.exists(`skins/${item.name}/ui_skin.json`)) {
        const bytes = await this.source.readBytes(`skins/${item.name}/ui_skin.json`);
        if (bytes) ui = tryParseAcJson(td.decode(bytes), null);
      }
      this.skins.push({ name: item.name, previewUrl, ui });
    }
  }

  /** Replace a skin's ui_skin.json object and mark it dirty. */
  setSkin(name, ui) {
    const skin = this.skins.find((s) => s.name === name);
    if (skin) { skin.ui = ui; this._dirtySkins.add(name); }
  }

  // ---- physics entries -----------------------------------------------------

  /** Sorted list of entry names (original case). */
  entryNames() {
    return [...this.entries.values()].map((e) => e.name).sort((a, b) => a.localeCompare(b));
  }

  hasEntry(name) { return this.entries.has(name.toLowerCase()); }

  entryText(name) {
    const e = this.entries.get(name.toLowerCase());
    return e ? td.decode(e.data) : null;
  }

  setEntryText(name, text) {
    const key = name.toLowerCase();
    const e = this.entries.get(key);
    if (!e) return;
    e.data = te.encode(text);
    this._ini.delete(key);          // invalidate cached parse
    this._dirtyData.add(e.name);
  }

  /** Parsed IniFile for an entry, cached. Edit it then call commitIni(). */
  ini(name) {
    const key = name.toLowerCase();
    if (!this._ini.has(key)) {
      const text = this.entryText(name);
      if (text == null) return null;
      this._ini.set(key, new IniFile(text));
    }
    return this._ini.get(key);
  }

  /** Re-serialize an edited IniFile back into its entry bytes. */
  commitIni(name) {
    const key = name.toLowerCase();
    const ini = this._ini.get(key);
    const e = this.entries.get(key);
    if (!ini || !e) return;
    e.data = te.encode(ini.serialize());
    this._dirtyData.add(e.name);
  }

  // ---- ui_car.json ---------------------------------------------------------

  setUi(nextUi) { this.ui = nextUi; this._uiDirty = true; }

  // ---- saving --------------------------------------------------------------

  get isDirty() { return this._dirtyData.size > 0 || this._uiDirty || this._dirtySkins.size > 0; }
  get dirtyEntries() { return [...this._dirtyData]; }

  /** The files a save would write right now, as { path, bytes }. */
  _plannedWrites() {
    const plan = [];
    if (this._dirtyData.size) {
      if (this.packed) {
        const list = [...this.entries.values()].map((e) => ({ name: e.name, data: e.data }));
        plan.push({ path: 'data.acd', bytes: pack(list, this.folderName) });
      } else {
        for (const name of this._dirtyData) {
          plan.push({ path: `data/${name}`, bytes: this.entries.get(name.toLowerCase()).data });
        }
      }
    }
    if (this._uiDirty && this.ui) {
      plan.push({ path: 'ui/ui_car.json', bytes: te.encode(stringifyAcJson(this.ui)) });
    }
    for (const name of this._dirtySkins) {
      const skin = this.skins.find((s) => s.name === name);
      if (skin && skin.ui) {
        plan.push({ path: `skins/${name}/ui_skin.json`, bytes: te.encode(stringifyAcJson(skin.ui)) });
      }
    }
    return plan;
  }

  /**
   * Persist edits. When autoBackup is on (and the source supports in-place
   * writes), the original of each overwritten file is copied into
   * _backups/<timestamp>/ once per car before anything is overwritten.
   * @returns {Promise<{written:string[], backupDir:string|null}>}
   */
  async save({ autoBackup = true } = {}) {
    const plan = this._plannedWrites();

    let backupDir = null;
    if (autoBackup && this.source.canWriteInPlace && !this._backupDone && plan.length) {
      backupDir = await this._backupOriginals(plan.map((p) => p.path));
      if (backupDir) this._backupDone = true;
    }

    const written = [];
    for (const { path, bytes } of plan) {
      await this.source.writeBytes(path, bytes);
      written.push(path);
    }
    this._dirtyData.clear();
    this._uiDirty = false;
    this._dirtySkins.clear();
    return { written, backupDir };
  }

  /** Copy the current on-disk version of each path into _backups/<timestamp>/. */
  async _backupOriginals(paths) {
    const ts = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    const dir = `_backups/${ts}`;
    try {
      for (const path of paths) {
        const original = await this.source.readBytes(path);
        if (original) await this.source.backupBytes(`${dir}/${path}`, original);
      }
      return dir;
    } catch {
      // Couldn't back up (e.g. write-restricted context) — the save itself will
      // fall back to a non-destructive download, so the on-disk original is safe.
      return null;
    }
  }
}

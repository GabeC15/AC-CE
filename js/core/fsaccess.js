// fsaccess.js — abstracts where a car's files come from and how to save them.
//
// Two implementations behind one CarSource interface:
//   FolderSource  — File System Access API (Chrome/Edge). Reads AND writes the
//                   real car folder in place. The headline workflow.
//   UploadSource  — <input webkitdirectory> fallback for other browsers.
//                   Read-only; "writes" are surfaced as file downloads.
//
// CarSource interface:
//   name                       car folder name (used as the ACD key)
//   canWriteInPlace            true if writeFile persists to disk
//   async exists(path)         -> boolean
//   async readBytes(path)      -> Uint8Array | null
//   async readBlobUrl(path)    -> object URL string | null   (for images)
//   async listDir(path)        -> { name, kind:'file'|'directory' }[]
//   async writeBytes(path, u8) -> void
// Paths are POSIX-style and relative to the car folder, e.g. "ui/ui_car.json".

export function supportsFsAccess() {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/** Prompt for a car folder using the File System Access API. */
export async function pickCarFolder() {
  const handle = await window.showDirectoryPicker({ id: 'ac-car', mode: 'readwrite' });
  // Best-effort: request write permission up front.
  if (handle.requestPermission) {
    await handle.requestPermission({ mode: 'readwrite' }).catch(() => {});
  }
  return new FolderSource(handle);
}

/** Build a read-only source from an <input webkitdirectory> FileList. */
export function sourceFromFileList(fileList) {
  return UploadSource.fromFileList(fileList);
}

class FolderSource {
  constructor(rootHandle) {
    this.root = rootHandle;
    this.name = rootHandle.name;
    this.canWriteInPlace = true;
    this.degraded = false; // set if a write had to fall back to a download
  }

  async _dirHandle(parts, create = false) {
    let dir = this.root;
    for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
    return dir;
  }

  async _fileHandle(path, create = false) {
    const parts = path.split('/').filter(Boolean);
    const file = parts.pop();
    const dir = await this._dirHandle(parts, create);
    return dir.getFileHandle(file, { create });
  }

  async exists(path) {
    try { await this._fileHandle(path); return true; } catch { return false; }
  }

  async readBytes(path) {
    try {
      const fh = await this._fileHandle(path);
      const file = await fh.getFile();
      return new Uint8Array(await file.arrayBuffer());
    } catch { return null; }
  }

  async readBlobUrl(path) {
    try {
      const fh = await this._fileHandle(path);
      return URL.createObjectURL(await fh.getFile());
    } catch { return null; }
  }

  async listDir(path) {
    try {
      const parts = path.split('/').filter(Boolean);
      const dir = await this._dirHandle(parts);
      const out = [];
      for await (const [name, h] of dir.entries()) out.push({ name, kind: h.kind });
      return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  }

  /** Ensure we hold readwrite permission, requesting it if needed (needs a user gesture). */
  async ensureWritable() {
    if (!this.root.queryPermission) return true; // older API: assume granted
    const opts = { mode: 'readwrite' };
    if (await this.root.queryPermission(opts) === 'granted') return true;
    return (await this.root.requestPermission(opts)) === 'granted';
  }

  /** Raw in-place write; throws on any failure. */
  async _write(path, u8) {
    if (!(await this.ensureWritable())) throw new Error('Write permission was not granted.');
    const fh = await this._fileHandle(path, true);
    const w = await fh.createWritable();
    await w.write(u8);
    await w.close();
  }

  async writeBytes(path, u8) {
    try {
      await this._write(path, u8);
    } catch (err) {
      // In-place write blocked (permission denied, or a sandboxed/unsupported
      // context): fall back to a download so the edit is never lost.
      this.degraded = true;
      this.lastError = err;
      downloadFile(path.split('/').pop(), u8);
    }
  }

  /** Write a backup copy in place; throws on failure (no download fallback). */
  async backupBytes(path, u8) {
    await this._write(path, u8);
  }
}

class UploadSource {
  constructor(name, files) {
    this.name = name;
    this.canWriteInPlace = false;
    this._files = files; // Map: relPath (lowercased) -> File
  }

  static fromFileList(fileList) {
    const files = new Map();
    let root = 'car';
    for (const f of fileList) {
      const rel = f.webkitRelativePath || f.name;
      const slash = rel.indexOf('/');
      if (slash >= 0) root = rel.slice(0, slash);
      const sub = slash >= 0 ? rel.slice(slash + 1) : rel;
      files.set(sub.toLowerCase(), f);
    }
    return new UploadSource(root, files);
  }

  async exists(path) { return this._files.has(path.toLowerCase()); }

  async readBytes(path) {
    const f = this._files.get(path.toLowerCase());
    return f ? new Uint8Array(await f.arrayBuffer()) : null;
  }

  async readBlobUrl(path) {
    const f = this._files.get(path.toLowerCase());
    return f ? URL.createObjectURL(f) : null;
  }

  async listDir(path) {
    const prefix = path ? path.toLowerCase().replace(/\/?$/, '/') : '';
    const seen = new Map();
    for (const key of this._files.keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash < 0) seen.set(rest, 'file');
      else seen.set(rest.slice(0, slash), 'directory');
    }
    return [...seen].map(([name, kind]) => ({ name, kind })).sort((a, b) => a.name.localeCompare(b.name));
  }

  async writeBytes(path, u8) {
    // No in-place write available — offer the bytes as a download instead.
    downloadFile(path.split('/').pop(), u8);
  }

  async backupBytes() {
    throw new Error('In-place backup is not available for uploaded folders.');
  }
}

/** Trigger a browser download of some bytes under the given filename. */
function downloadFile(name, u8) {
  const blob = new Blob([u8], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

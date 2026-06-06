# Assetto Corsa Car Editor

A local, browser-based editor for Assetto Corsa cars. Open a car folder, tweak
its physics, UI info and skins, and save — **including reading and writing the
packed `data.acd` directly**, so you don't need Content Manager to unpack a car
first.

Inspired by [Drew Kellar's AssettoCorsaCarBuilder](https://drewkellar.github.io/AssettoCorsaCarBuilder/).

## What it does

- **`data.acd` pack/unpack in the browser.** A byte-accurate port of the AC
  format (folder-name key derivation, `-1111` header, per-entry encryption),
  validated against real Kunos cars. Edit a packed car and save it back as a
  game-ready `data.acd`.
- **Physics editor** — mass, fuel, engine (rev limiter, idle, turbo), drivetrain
  (diff, clutch, gear ratios), brakes, tyres, steering. Paired slider + number
  inputs that bind straight to the `.ini` files, plus a power-curve chart drawn
  from `power.lut`.
- **Suspension tab** — per-axle alignment (camber, toe in degrees), spring/ARB,
  dampers and bump-stops from `suspensions.ini`, with two live SVG references:
  a **geometry diagram** (top-down wheelbase / track / weight-distribution +
  camber gauges) and a **linkage view** that plots the real 3D pickup points
  (double-wishbone or strut) in front and side projections, with **caster and
  KPI computed from the hardpoints** and a ride-height reference.
- **Tyres tab** — per-compound (Street/Semislick/…) Front & Rear editor for
  pressures, grip (DX/DY), dimensions and spring rate, with compound switching
  and a default-compound control (CM backup sections left untouched).
- **Aero & Electronics tab** — per-wing angle and CL/CD gains plus **interactive
  CL/CD vs angle-of-attack curves** (drag points to reshape each wing's LUT), and
  ABS / traction-control / EDL toggles and limits.
- **UI Info editor** — `ui/ui_car.json`: name, brand, class, specs, tags,
  description. Tolerant parser handles the malformed JSON AC often ships.
- **Skins manager** — preview thumbnails plus per-skin editing of `ui_skin.json`
  (skin name, driver, team, number, country, priority); creates the file for
  skins that lack one.
- **Raw Files** — edit any unpacked data file as text. Edits are **lossless**:
  comments and tab alignment are preserved; only changed values are touched.
- **Safe saving** — a write-permission check, an automatic download fallback if
  in-place writing is blocked, and **Auto-backup**: before the first overwrite
  of a car, the original `data.acd` / data files / `ui_car.json` are copied into
  `_backups/<timestamp>/` inside the car folder (toggle in the top bar).

## Running it

ES modules must be served over HTTP (not opened as `file://`). A tiny
zero-dependency server is included:

```bash
node tools/serve.mjs 8000
# then open http://localhost:8000
```

Or use any static server (e.g. `python -m http.server 8000`). Server configs
are saved in `.claude/launch.json`.

### Browser support

- **Chrome / Edge** (recommended): "Open folder" uses the File System Access
  API to read **and write the car folder in place**.
- **Other browsers**: "Open (upload)" loads a copy of the folder; saving
  downloads the modified file for you to drop back in.

## How to edit a car

1. Open a car folder, e.g. `…/steamapps/common/assettocorsa/content/cars/abarth500`.
2. Edit values across the Overview / Physics / UI Info / Skins / Raw Files tabs.
3. Click **Save**. Packed cars are re-packed to `data.acd`; unpacked cars write
   individual files.

> Auto-backup (on by default) copies the originals to `_backups/<timestamp>/`
> before the first overwrite, so you can always restore. AC prefers `data.acd`
> over an unpacked `data/` folder if both exist.

## Project layout

```
index.html            app shell
css/styles.css        dark UI styling
js/
  app.js              controller: load, tabs, save, status
  core/
    acd.js            data.acd codec (unpack/pack)   ← validated
    ini.js            lossless AC INI parser/serializer
    acjson.js         tolerant ui_car.json reader/writer
    fsaccess.js       File System Access API + upload fallback
    car.js            in-memory car model + change tracking
  ui/
    dom.js            tiny hyperscript helper
    controls.js       data-bound slider/number/text controls
  panels/             overview, physics, uiinfo, skins, rawfiles
tools/
  serve.mjs           static dev server
  test-acd.mjs        codec validation against a real car
  test-ini.mjs        INI parser validation
```

## Tests

Validate the core against a real installed car:

```bash
node tools/test-acd.mjs "D:/SteamLibrary/steamapps/common/assettocorsa/content/cars/abarth500"
node tools/test-ini.mjs "D:/SteamLibrary/steamapps/common/assettocorsa/content/cars/abarth500"
```

## Roadmap

- Skin management (rename, import, set preview)
- ZIP export for the upload fallback
- Validation/diagnostics panel (out-of-range values, broken references)
```

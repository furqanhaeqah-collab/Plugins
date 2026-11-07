# Social Media Design Automation for Adobe Illustrator

A CEP panel (HTML/CSS/JS) backed by an ExtendScript engine. Create social media artboards, duplicate one design across them with fit/fill scaling and background stretching, draw safe-zone guides, and batch export PNG / JPEG / SVG / PDF.

> **Testing status:** the code passes syntax checks but has **not been run inside Illustrator** (no Illustrator in the build environment). Work through `docs/TESTING.md` before relying on it; see "Known risks" below.

## Why CEP + ExtendScript (not UXP)

Checked in Nov 2026: Illustrator's UXP is still internal to Adobe, with no public third-party API or timeline (Adobe Community forum, Feb 2026; Mapsoft). CEP is the supported route for third-party Illustrator panels, and ExtendScript gives full access to artboards, `exportFile` and `saveAs`. Adobe has said CEP will eventually be replaced, so the host logic is isolated in `host/host.jsx` and the UI talks to it only through `client/js/bridge.js`, which keeps a future UXP port contained.

Compatibility: Illustrator 2020 (24.0) and newer, macOS and Windows.

## Install

1. Quit Illustrator.
2. macOS: `bash scripts/install-mac.sh`   Windows: double-click `scripts\install-windows.bat`
   (copies the panel to your user CEP extensions folder and sets `PlayerDebugMode=1` so unsigned panels load).
3. Start Illustrator → **Window › Extensions › Social Media Automation**.

Manual install: copy `CSXS/`, `client/`, `host/` (and `.debug`) into
- macOS `~/Library/Application Support/Adobe/CEP/extensions/com.smda.illustrator/`
- Windows `%APPDATA%\Adobe\CEP\extensions\com.smda.illustrator\`

Then enable `PlayerDebugMode` (macOS: `defaults write com.adobe.CSXS.12 PlayerDebugMode 1`; Windows: registry `HKCU\Software\Adobe\CSXS.12`, string value `PlayerDebugMode` = `1`). Use the CSXS number matching your Illustrator (2020 = 9, 2021–2022 = 10/11, 2023+ = 11/12); the scripts set 9–13.

## Using it

| Tab | What it does |
|---|---|
| Dashboard | Document info, six quick actions, recent presets |
| Artboards | Tick presets, add custom sizes, copies per preset, gap, layout, name template, create (optionally place design + draw guides), auto-rename |
| Automation | Source artboard, targets, fit / fill / original size, margin, alignment grid, background stretch, clip, per-platform layers, safe-zone guides |
| Export | Scope, formats (multi-select), 0.5×–4×, JPEG quality, transparency, naming, destination, progress + log |
| Settings | Default format / naming / resolution / folder, custom preset management, reset |

Typical flow: design on one artboard → Artboards tab → tick presets → **Create artboards** (with "Duplicate design" on) → adjust by hand → Export tab → **Batch export**.

Placed designs are grouped as `SMDA: <artboard name>` inside layers named `SMDA <Platform>`, so they are easy to find, move, or replace. "Replace previous placements" removes those groups before re-placing.

## Behaviour notes

- Units: Illustrator points = pixels at 100%. Export sizes equal artboard sizes at 1×.
- Background detection: a path/compound path covering ≥ 85% of the source artboard is treated as the background and stretched to each target artboard (gradients preserved). Disabled when "Use current selection" is on.
- Source art must be unlocked and visible. Locked/hidden objects are not duplicated.
- Max 100 artboards per document (Illustrator limit); the panel warns before exceeding it.
- SVG and PDF are exported via a temporary document sized to the artboard (the source document is never modified); text becomes outlines in SVG.
- Safe zones are approximate percentages, not official platform specs. Edit them in `client/js/presets.js`.
- Existing files are never overwritten: collisions get `_2`, `_3`, …

## Known risks (verify first)

1. `exportFile` with `artBoardClipping` for PNG/JPEG exports the **active** artboard; the code sets it per artboard. Confirm the output file name has no unexpected suffix on your version.
2. The SVG/PDF temp-document path uses copy/paste; check placement and that fonts/effects survive.
3. Stacking order of duplicated art relies on `executeMenuCommand('group')`; check complex layered files.
4. CMYK documents export PNG/JPEG as RGB (by Illustrator design).

## Project structure

```
CSXS/manifest.xml        CEP manifest (ILST 24.0+)
.debug                   remote-debug port 8099 (dev only)
host/host.jsx            ExtendScript engine (see below)
client/index.html        UI
client/css/style.css     theme (follows Illustrator dark/light)
client/js/csi-lite.js    minimal CSInterface replacement
client/js/bridge.js      Illustrator Integration Layer (Promise wrapper, protocol)
client/js/settings.js    Settings Manager (localStorage)
client/js/presets.js     Preset Manager (+ safe-zone data)
client/js/naming.js      File Naming Utility
client/js/app.js         UI components and controller
scripts/                 install + package scripts
docs/                    developer docs, testing checklist
```

Host modules (`SMDA.*` in `host.jsx`): `Json`, `Util`, `Layers`, `Scaling` (scaling engine), `Placement` (design placement engine), `Artboards` (generator), `Safe`, `Export`, `Api` (public entry points).

## Packaging

`bash scripts/package.sh` → `dist/SocialMediaDesignAutomation-1.0.0.zip`.
For a signed `.zxp` (no PlayerDebugMode needed), use Adobe's `ZXPSignCmd` with a certificate; commands are in the header of `scripts/package.sh`.

## Troubleshooting

- Panel missing from the menu: PlayerDebugMode not set for your CSXS version, or Illustrator not restarted.
- Blank panel: open `http://localhost:8099` in Chrome (needs `.debug`) to see console errors.
- "Not connected": `host.jsx` failed to load; the panel retries `$.evalFile` automatically, so check the ExtendScript Toolkit / VS Code ExtendScript debugger for syntax errors.

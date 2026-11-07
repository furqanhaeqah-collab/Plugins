# Testing checklist (run inside Illustrator)

Prepare a document (RGB, 1080×1080 artboard) containing: a full-artboard gradient rectangle, a text frame, a vector shape with a stroke, and a placed image. Save a backup copy first.

## Artboards
- [ ] Panel opens; Dashboard shows document name, color mode, artboard count.
- [ ] Select 5 default presets → **Create artboards** with "Duplicate design" off → 5 artboards appear right of the original, sizes exact, named `Instagram_Post` etc., one row per platform.
- [ ] Copies per preset = 3 → names get `_01 _02 _03`.
- [ ] Add custom size 1500×500 → appears under "Custom", ticked; create works. Delete it from Settings.
- [ ] Creating past 100 artboards shows an error, creates nothing.
- [ ] Auto-rename: rename an artboard to junk with a preset size → renamed back.

## Placement
- [ ] Automation: source = original artboard, mode Fit, margin 5% → design appears on each target, aspect ratio kept, centered.
- [ ] Mode Fill + Clip → artwork covers artboard, clipped at edges.
- [ ] Background stretch → gradient rectangle exactly covers each artboard; with "Treat as normal artwork" it scales with the art.
- [ ] Alignment grid: top-left puts art at the top-left margin.
- [ ] Re-run with "Replace previous" → no duplicate groups. Without it → duplicates (expected).
- [ ] Layers panel shows `SMDA <Platform>` layers; groups named `SMDA: <artboard>`.
- [ ] Text stays live and editable; strokes scale when option on.
- [ ] Source with locked layer: clear error or skipped items, no crash.
- [ ] **Generate Platform Variations** with an empty source artboard → error and **no** new artboards.

## Quick actions
- [ ] Fit Artwork to Artboard / Center Artwork on a selected object.
- [ ] Export All Designs uses the Export tab settings.

## Safe zones
- [ ] Draw guides → layer `SMDA Safe Zones` with guide rectangles; Clear removes it.

## Export
- [ ] PNG at 1×: file pixel size = artboard size. At 2× = double.
- [ ] PNG transparent on/off (white matte when off).
- [ ] JPEG quality 50 vs 100 differ in size.
- [ ] SVG: opens in a browser, viewBox = artboard size, no stray art.
- [ ] PDF: single page, artboard size.
- [ ] Multi-format (PNG+PDF) × scope "ticked artboards".
- [ ] Naming conventions and custom template `{doc}_{key}_{w}x{h}`; preview matches files.
- [ ] Re-export into same folder → `_2` suffix, no overwrite.
- [ ] Progress bar, per-file log, completion toast; one failing artboard (empty) does not stop the rest.
- [ ] Browse / Open folder work on your OS.

## Settings / UI
- [ ] Settings persist after closing and reopening the panel.
- [ ] Default format change updates the Export tab.
- [ ] Switch Illustrator UI brightness → panel theme follows.
- [ ] Close the document mid-session → panel shows "No document open", buttons give a clear message.

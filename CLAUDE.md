# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Vite dev server on :5173
npm run build          # tsc -b && vite build
npm run typecheck      # tsc --noEmit  (covers src/ only — see "Testing" below)
npm run selftest       # JS/TS checks, then the Python unit tests if a local CPython has numpy
npm run test:python    # just the Python unit tests (skips cleanly with no interpreter)
npm run verify:python  # boots real Pyodide in Node and diffs its output against desktop CPython
npm run fetch-model    # optional: self-host the background-removal model into public/bg-model
```

There is no test framework. `scripts/selftest.ts` is bundled by esbuild and run in Node; it uses a local
`check(name, condition, detail)` helper and exits non-zero on failure. `scripts/python-tests.mjs` runs
every `test_*.py` suite in turn (`test_enhance.py`, `test_score.py`) and reports them all even if one
fails. To run one area, comment out
sections or filter the output (`npm run selftest | sed -n '/brand preset/,$p'`); the whole suite takes
about three seconds. The Python tests run directly: `python scripts/test_enhance.py`.

`tsconfig.json` includes `src` only, so **files under `scripts/` are not typechecked** — a type error
there surfaces only when the script runs.

## Architecture

React + TypeScript + Vite + Zustand. No backend: editing, background removal, image enhancement,
project storage and export all happen in the browser.

### One engine, two products

`src/data/formats.ts` is the **only** place the horizontal thumbnail (1280×720) and the vertical Shorts
cover (1080×1920) differ — canvas size and presets, safe-zone insets, left-toolbar order, export copy.
Everything else is shared. Add a format by adding an entry there, not by branching in components.

### Rendering — the WYSIWYG invariant

`src/engine/renderer.ts` exposes `renderProject(ctx, project, {scale})`, which draws the scene into any
2D context at any scale. The editor canvas, template previews, export and the saved project thumbnail
all call it. **Anything drawn inside `renderProject` ends up in exported files.** Selection handles,
smart guides, grids and the safe-zone overlay are therefore drawn in `CanvasStage.drawOverlay`, after
`renderProject` returns — never add editor chrome to the renderer.

Each layer is rasterised once into an offscreen canvas (effects included) and cached by `visualKey()`,
which hashes every property *except* those in `TRANSFORM_KEYS` (x, y, rotation, opacity, locked, hidden,
name, groupId). Moving or fading a layer is a cache hit. If you mutate a layer outside
`store.updateObject`, call `invalidateRaster(id)` yourself or the canvas will not change.

Outline, glow, shadow and colour overlay are all built from a flat-colour silhouette of the layer's
alpha, so one code path serves text, shapes and cut-out photos. `dilate()` (the union of the silhouette
translated around a circle) is that morphology, shared by the outline effect and by mask expansion;
`erode()` is the same dilation applied to the inverse and punched back out.

`BaseObject.mask` is the feather mask (Premiere Pro's model: shape, feather, expansion, invert). It is
applied to the content **before** effects, so effects follow the feathered shape. Two invariants the
selftest pins down: `maskPadding` grows the raster only for a `subject` mask, because a drawn region is
clamped inside the layer box; and `maskInset` keeps a drawn region's whole falloff inside that box, since
a fade centred on the edge would be clipped in half and read as a hard line.

`ShapeObject.fade` turns a flat fill into a gradient to transparent — the black scrim that makes white
type readable over a photo. Two pure functions carry it, and both are pinned by the selftest:

- `fadeStops()` maps softness and midpoint to gradient offsets. A zero softness still emits two distinct
  stops, because two stops at one offset is a degenerate gradient.
- `fadeVector(from, angle)` is the direction the fill travels. `angle` is a protractor reading: 90° is
  square to the side the shadow comes from. **It must return the plain axis-aligned vector at exactly
  90°** or every design made before the angle existed would shift — hence `(sin, cos)` rather than
  `(cos, sin)`. Out-of-range angles clamp rather than wrap.

The UI slider is inverted on purpose: the stored value is the angle (90 → 10) while the handle moves
right, which is what `Slider`'s `display` prop exists for.

**Text is positioned from measured ink, never from `textBaseline: 'middle'`.** That baseline centres the
font's whole ascent + descent box — 1.515 em for Anton — so with a 1.0–1.05 line height, uppercase text
(which uses none of the reserved descent) gets pushed to the top of its line and out of a highlight
plate. `engine/text.ts` measures `actualBoundingBoxAscent/Descent`, and `lineGeometry()` derives both the
alphabetic baseline and the plate from that ink, so padding above and below is equal by construction.
`textRasterPadding()` grows the offscreen canvas when a tight line height lets the plate spill past the
layer box. Keep any new text drawing on that path.

### State and history

`src/store/editorStore.ts` (Zustand) holds `project`, `selection`, `past`/`future` and view flags.
History snapshots are pushed **before** a mutation: call `pushHistory()` first, then mutate. Drags and
slider sweeps pass a tag (`pushHistory('brightness:id')`) that coalesces repeats within 500 ms, so one
gesture is one undo step. UI sliders push on `onPointerDown`, not on change.

The scene is a flat `objects` array; array index is z-order (index 0 is the bottom layer). Groups are a
shared `groupId` string, not nested containers.

### Assets

`src/engine/assets.ts` keeps a synchronous module-level registry of decoded `ImageBitmap`s, because the
renderer cannot await. Consequences:

- Before showing a project loaded from storage, `await ensureAssets(assetIdsOf(project))` (see
  `HomeScreen`), or the canvas draws placeholders.
- Background removal and Python enhancement register **new** assets and swap the layer's `assetId` /
  `cutoutAssetId`. Old assets stay in the registry, which is why Ctrl+Z restores the previous version
  for free — don't add a bespoke revert model.

### Persistence and migrations

IndexedDB via `src/storage/db.ts`: projects as JSON in one store, image blobs in another keyed by asset
id, so undo history never carries bitmaps. Autosave is debounced 1.5 s in `src/hooks.ts`.

**Any new field on `Project` or a scene object must get a default in `src/engine/normalize.ts`**, which
runs on every load. Projects saved by earlier versions are still out there in users' browsers.

### Async subsystems (all lazy, all off the main thread)

| Feature | Entry point | Worker | Notes |
| --- | --- | --- | --- |
| Background removal | `engine/backgroundRemoval.ts` | `workers/bgRemove.worker.ts` | Two engines behind one call: `ai` (ISNet via `@imgly/background-removal`, model from CDN) and `fast` (flood fill in `engine/cutout.ts`, offline). UI falls back to `fast` when the model can't load. |
| Image enhancement | `engine/pythonImage.ts` | `workers/pyImage.worker.ts` | Pyodide (CPython 3.14 + numpy + Pillow) from CDN, ~15 MB on first use. The pipeline is `src/python/enhance.py`, imported with `?raw`; the Pyodide FFI glue lives in the worker's `BRIDGE` string so the Python module stays plain CPython and stays testable. |
| Object mask & blur | `engine/runFocus.ts` | same worker, `focus_blur` op | `select_object` grows a scribble into a mask; `focus_blur` softens one side of it. Pure helpers live in `engine/objectMask.ts`, away from the `?worker` import, as with the scorer. |
| Thumbnail scoring | `engine/runScore.ts` | same worker, `analyze` request | `src/python/score.py` measures the rendered pixels at each platform's width and returns JSON. Shares the runtime with enhancement. |

**Python modules are written to Pyodide's filesystem and imported**, not exec'd into globals, so
`score.py` can `import enhance` exactly as it does under desktop CPython — one environment, one set of
tests. The worker writes both files to `/thumbnail-studio` and the bridge calls `enhance.apply_op(...)`.

The scorer is split in two on purpose: `engine/thumbnailScore.ts` holds the types, every label and every
piece of advice, plus `textRegions`/`occlusionRects`, and imports **nothing** from `pythonImage.ts` —
`?worker` imports cannot be bundled by esbuild, so anything the selftest exercises must stay clear of
them. `engine/runScore.ts` is the thin runner that renders and calls the worker. Python returns ids,
scores and raw values and knows no English; the TypeScript side names them.

To add an image operation: add the function and a dispatch branch in `enhance.py`, a test in
`scripts/test_enhance.py`, an entry in `ENHANCEMENTS` in `pythonImage.ts`. `scripts/verify-pyodide.mjs`
mirrors the worker's bridge — keep the two in sync when touching the FFI.

**Matte clean-up** (`despeckle` / `defringe` / `clean_matte`) is the one path that sends a second buffer
across the FFI: an 8-bit `region` mask the size of the image, which the clean brush uses to confine the
work to its stroke. Two things about it are easy to get wrong:

- A JS `null` reaches Python as `JsNull`, **not** `None`, so the bridge tests `hasattr(mask_buf,
  "to_py")` rather than `is not None`. `npm run verify:python` is what catches this class of bug; it
  found exactly this one.
- `despeckle` always labels the whole image so the subject is recognised as the largest component; only
  `defringe` is cropped to the stroke's bounding box. Labelling a crop instead would let a brush stroke
  over the subject delete part of it.

The clean brush writes a **new** asset on pointer-up rather than mutating pixels, so unlike the
erase/restore brush it is undoable.

**Object masking** (`select_object` / `focus_blur`) is the second consumer of that region argument, and
it reads the mask the opposite way round: the stroke is a *selection*, not a place to work. Three things
are load-bearing and easy to undo by accident:

- The flood is gated by both a **local** step (an edge stops it) and a **global** distance from the
  scribble's mean colour. Drop either and it leaks — the first lets same-coloured neighbours merge, the
  second lets a gradient walk the selection off the object.
- The result is bounded by the scribble's bbox grown by `spread`, with a floor of `SELECT_MIN_REACH`
  (8% of the frame) so a single dab can still claim a whole face.
- `focusBlurAsset` **copies** the region instead of transferring it, because the caller keeps the stroke
  so the strength can be changed without scribbling again. `runFocus` always re-blurs
  `selection.sourceAssetId` — the asset as it was *before* the first blur — so adjusting the strength
  replaces that blur rather than stacking a second one on it, and zero returns the source asset itself
  with no Python call at all.

`focusSelection` in the store is that remembered stroke. It is dropped when the brush is switched off
and when the properties panel changes layer, since it points at one layer's asset by id.

### Icons

`data/icons.ts` is the browse tree and `engine/iconLibrary.ts` the Iconify API client. A leaf carries a
**query**, not a list of icon ids, so the library grows without the file changing — and the query is
written in the icon sets' vocabulary rather than the creator's ("Habit" finds nothing; `calendar-check`
finds the drawing). Adding a category is a row in that file.

Three invariants hold the design up:

- Icons are fetched **in bulk** (`loadIcons` → `{prefix}.json?icons=…`, batched by `ICON_BATCH`), never
  one request per icon. Fifty parallel requests earn a **429** from the API, and the symptom is a grid of
  broken tiles, not an error anyone can read. Previews render from that data with no request of their
  own, and so does placing an icon.

- An icon is an **ImageObject with `icon` set to its Iconify id**, rasterised black, and its colour is
  `effects.overlay`. Because outline, glow and shadow are built from a layer's silhouette, an icon gets
  all of them for nothing — and recolouring stays synchronous and offline. Never give icons their own
  object type or their own effect pipeline.
- `ICON_PREFIXES` is limited to monochrome, permissively licensed sets. A multi-colour set would lose its
  palette the instant the overlay recoloured it.

`registerBlob` cannot decode SVG in every browser, so `rasterizeSvg` goes through an `<img>`; that needs
an intrinsic size, which `buildSvg` writes into the markup. `buildSvg` also substitutes `currentColor`,
without which an icon rasterises as an invisible black-on-black shape. Icon bodies reach the DOM, so
`sanitizeBody` strips scripts and `on*` handlers — scripts inserted via innerHTML do not run, inline
handlers do. `ImageProperties` hides the photographic
sections when `object.icon` is set, because a full-opacity overlay makes every one of them a no-op.

### Rules engines

Two advisory analysers, both pure functions over a `Project`:

- `engine/designAssistant.ts` — readability/composition score shown when nothing is selected.
- `engine/brandQa.ts` — grades a design against a **brand preset**. Every threshold is read from the
  preset, so it is not specific to any channel. Its colour-budget check samples a real render
  (`sampleColorShare`), so it needs a DOM; `runBrandQa(project, null, preset)` skips those items and
  works headlessly.

Templates are graded by these in the selftest: brand layouts must pass `runBrandQa` for their own preset
with no warnings, and every entry in `data/shortsTemplates.ts` must produce no failing `analyzeDesign`
check. A layout that drifts outside the safe area, or paints an off-palette colour, fails the suite
rather than shipping.

### Brand presets

`data/brands.ts` defines the `BrandPreset` shape and the registry. A brand is pure data — palette with
per-colour budgets, type scale, element vocabulary, backgrounds, cut-out treatment and the `rules` the QA
engine enforces (headline word range, highlight count, subject side, layer ceiling). Four ship today:

| Preset | File | Character |
| --- | --- | --- |
| Brand 1 | `data/superLearner.ts` + `data/superLearnerTemplates.ts` | Dark ground, Anton + Inter, one yellow keyword, copy 60% / creator 40% |
| Brand 2 | `data/brand.ts` + `data/brandTemplates.ts` | Light ground, navy + yellow, note cards, white cut-out outline |
| Brand 3 | `data/justinSung.ts` + `data/justinSungTemplates.ts` | Full-bleed photo under a black scrim, sentence-case Inter 900, one red mark |
| Vivian | `data/vivian.ts` + `data/vivianTemplates.ts` | Charcoal ground, Anton + Inter, one yellow keyword and one Tabler outline icon; rules tuned for restraint (2-4 hook words, 10-layer ceiling, shadows capped at 40% / 8 px) |

`cutout.requireCutout: false` marks a brand built on full-bleed photography, so QA stops asking for a
cut-out it does not want. `title-words` counts the whole headline *band* (every text within 15% of the
largest size), not one layer — without per-word styling a highlighted keyword has to be its own layer,
and counting only the largest read "Stop / cramming" as a one-word headline.

`Project.brandId` records which preset a design follows; applying a brand layout sets it. `BrandPanel`,
`engine/brandApply.ts` and `engine/brandQa.ts` all take the preset as an argument — **adding a channel is
adding a data file plus a registry entry, never a second panel or a second rules engine.** Layouts are
attached to their brand by `withBrand()` in `data/templates.ts`, so the brand files carry no registry
bookkeeping; read them back with `templatesForBrand(id)`.

### Colour psychology

`data/colorPsychology.ts` is the whole feature: twelve hues, each with what it makes a viewer feel,
where it is conventionally used and what a designer reaches for it to do. `ColorScreen` is a renderer
over that array and holds no colour knowledge of its own, so adding or re-wording a hue is a data edit.

The meanings are convention and are presented as reference. The **badges are measurement** — WCAG
relative luminance and contrast ratio against a dark and a light ground, at the 3:1 threshold for large
text, because a headline on a thumbnail is always large text. The selftest pins both halves: the twelve
entries and their shape, and the maths (a hex round-trip, 21:1 for black on white, every tint lighter
than its hue, every hue readable on at least one ground).

It is a `Screen`, not a panel, because it is read rather than operated — but it is opened from the
editor as often as from home, so `openColorGuide`/`closeColorGuide` remember `colorsReturnTo` and every
hue can be applied to the selection in place. Applying maps by layer type: text takes `color`, a shape
takes `fill`, an icon takes `effects.overlay` (its raster is black — the overlay *is* its colour), and a
photograph is skipped, since recolouring one is a filter and not a fill.

### Font psychology

`data/fontPsychology.ts` is the typography counterpart and follows the colour guide exactly: five
categories (serif, sans serif, script, display, slab serif) with what each says first, what it also
says, where it is used and which faces a designer would name, plus the weight ramp, the topic → feeling
→ direction table, the formula and the worked pairing. `FontScreen` is a renderer over that data and
holds no typography knowledge of its own.

Three things are load-bearing:

- **`families` must name faces `FONTS` actually offers.** It is what the "apply" chips are built from, so
  a family the picker does not have is advice that dead-ends. The selftest fails on an unknown name.
- **Serif and slab serif ship no family**, because the library has none. They fall to `specimen` — a
  system stack shown for teaching — and render `SPECIMEN_NOTE` instead of an empty chip row. Adding a
  serif to `FONTS` (and to the Google Fonts URL in `index.html`) is what would make them applicable.
- **`nearestWeight` clamps on apply.** Anton ships one weight, so dropping it on a 900 layer has to come
  down to 400 or the canvas renders a synthetic bold that the export cannot reproduce.

`PAIRING_GROUND`/`PAIRING_EXAMPLE` quote the charcoal preset's three values; the selftest checks them
against `data/vivian.ts`, since a worked example that has drifted from the brand it cites teaches the
wrong thing. Entry points mirror the colour guide — `openFontGuide`/`closeFontGuide` with
`fontsReturnTo`, from the home screen and the editor's view menu.

### Preview surfaces

`data/previewSurfaces.ts` lists every placement the Preview dialog reproduces — one row per real YouTube
surface, with the CSS width it gets there and a layout name. `PreviewDialog` maps over
`groupedSurfaces(format)` and switches on `layout`; it holds no list of its own. Adding a placement is a
row in that file, and adding a *layout* means a new `case` in the dialog's `Surface` switch — the
selftest checks every surface's layout is one the dialog renders, and that no surface is wider than its
canvas (a preview that upscales misrepresents the design).

The preview deliberately does **not** inherit the editor's dark theme: `.pv-body` defines its own two
palettes (`--pv-*`) so it can show YouTube's light and dark surfaces. Keep colours inside it reading from
those variables.

### Templates and presets

`data/templates.ts` merges brand, general and Shorts layouts into `TEMPLATES`; the sub-modules import
only *types* from it, which keeps the cycle type-only. A `TemplateDef.build(width, height)` returns
`{background, objects}` built with `engine/factory.ts`; applying one switches the canvas to the
template's `format` and adopts its `brand`.

## Conventions

- TypeScript is strict with `noUnusedLocals`/`noUnusedParameters` — an unused import fails the build.
- Comments explain *why* (a non-obvious constraint, a tuned constant), not what the line does.
- No CSS framework: one hand-written `src/styles.css` with CSS custom properties for the dark editor
  theme. Class names are plain and shared (`.btn`, `.section`, `.qa-row`).
- `src/components/ui.tsx` holds the shared primitives (`Section`, `Field`, `Slider`, `ColorInput`,
  `Segmented`, `Toggle`, `Modal`). `Slider` and `ColorInput` handle history coalescing themselves.

## Known trade-offs

- The live adjustment sliders are canvas-speed approximations (blend layers for temperature/tint/
  highlights/shadows, a 3×3 Laplacian for sharpness). The Python engine does the real versions and bakes
  them into the asset.
- `dist/` carries a ~24 MB `ort-wasm-simd-threaded.jsep.wasm` that ONNX Runtime references statically. It
  is not fetched at runtime and can be dropped from a deploy.
- The AI background-removal model and the Pyodide runtime are both CDN-fetched on first use, so the
  offline promise holds only after they are cached (or after `npm run fetch-model` for the model).

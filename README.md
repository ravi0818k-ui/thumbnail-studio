# Thumbnail Studio

A minimalist, browser-based YouTube thumbnail editor. Upload → design → enhance → export, with no
application backend: editing, background removal, project storage and export all happen on the device.

```
npm install
npm run dev            # http://localhost:5173
npm run build          # production bundle in dist/
npm run typecheck
npm run selftest       # headless checks for the algorithmic core (+ Python, if available)
npm run verify:python  # runs the image pipeline inside real Pyodide and diffs it against CPython
```

## What is in this build (the MVP from the spec, §44)

| Area | Status |
| --- | --- |
| 1280 × 720 canvas, 1920 × 1080 and custom sizes | ✅ |
| YouTube Shorts: 1080 × 1920 canvas, safe zone, vertical templates, mobile preview | ✅ (see below) |
| Text auto-fit, one-click creator effects, subject placement, composition score | ✅ |
| Python (Pyodide) image engine: CLAHE, denoise, unsharp, tone curves, Lanczos upscale | ✅ (see below) |
| Upload (PNG/JPG/WEBP/SVG), drag-and-drop, clipboard paste | ✅ |
| Text with fonts, stroke, spacing, plates and one-click styles | ✅ |
| Shapes, arrows, marks, badges, emoji | ✅ |
| Backgrounds: solid, gradient, image, generated patterns, presets | ✅ |
| Crop, resize, rotate, flip, corner radius | ✅ |
| Brightness / contrast / saturation / exposure / highlights / shadows / temperature / tint / sharpness / blur | ✅ |
| Filter presets with strength | ✅ |
| Background removal: ISNet model + fast flood fill, erase/restore brush | ✅ (see below) |
| Layer order, set as canvas background, canvas context menu | ✅ (see below) |
| Outline, glow, drop shadow, colour overlay | ✅ |
| Layers: reorder, lock, hide, duplicate, delete | ✅ |
| Group / ungroup, align, smart guides, snapping | ✅ |
| Undo / redo, keyboard shortcuts | ✅ |
| Templates across 11 categories | ✅ |
| Brand presets (Brand 1, Brand 2, Brand 3) + live design QA | ✅ (see below) |
| Colour psychology reference with contrast badges | ✅ (see below) |
| IndexedDB projects with autosave | ✅ |
| PNG / JPG / WEBP export, 1–3×, quality, transparency | ✅ |

Deliberately **not** in this build (spec phases 2–3): a freehand draw tool, AI enhance/upscale/object
erase, WebGL effects, brand kits, collaboration and cloud sync.

## Architecture

```
React + TypeScript + Vite
        │
        ├── Zustand store ........ src/store/editorStore.ts   scene + selection + history
        ├── Renderer ............. src/engine/renderer.ts     Canvas 2D, raster cache per layer
        ├── Interaction .......... src/components/CanvasStage.tsx
        ├── Image processing ..... src/engine/cutout.ts + src/workers/bgRemove.worker.ts
        ├── Storage .............. src/storage/db.ts          IndexedDB (projects + assets)
        └── Export ............... src/engine/export.ts
```

**One renderer, two destinations.** `renderProject()` draws the scene into any 2D context at a given
scale. The editor canvas and the exported bitmap call the same function, so the export is exactly what
was on screen — there is no second code path to keep in sync.

**Raster cache.** Each layer is rasterised once into an offscreen canvas, effects included, and re-used
until one of its visual properties changes. Moving, rotating or fading a layer then costs a single
`drawImage`, which is what keeps dragging smooth with effect-heavy layers.

**Effects by silhouette.** Outline, glow, shadow and colour overlay are built from a flat-colour copy of
the layer's alpha. The outline is a union of 48 translated silhouettes — a morphological dilation — so a
cut-out person gets the same clean sticker edge as a text layer, from one code path.

**History.** Snapshots of the project are pushed *before* a mutation begins, and drags/slider sweeps
coalesce by tag inside a 500 ms window, so a gesture is one undo step rather than a hundred.

**Storage.** Projects are JSON in IndexedDB; image blobs live in a separate store keyed by asset id, so
the undo history never carries bitmaps. Autosave runs 1.5 s after the last change.

## Python image engine (Pyodide)

Some image quality work simply cannot be done with Canvas 2D filters, and the approximations it forces
were the weakest part of this editor. So the heavy pixel work now runs in **CPython 3.14 compiled to
WebAssembly** (Pyodide 314.0.7) with **numpy** and **Pillow**, in a Web Worker. Still no server: the
pixels go from the canvas into WebAssembly memory and back.

The pipeline is `src/python/enhance.py` — a plain, dependency-light Python module:

| Operation | What it does that canvas filters cannot |
| --- | --- |
| Auto enhance | White balance → auto levels → local contrast → restrained sharpen |
| Local contrast | CLAHE on luminance with clipped per-tile histograms, bilinearly interpolated |
| Auto levels | Percentile stretch — rescues a washed-out capture |
| Fix colour cast | Grey-world white balance |
| Denoise | Guided filter: smooths flat areas, keeps edges |
| Sharpen | True unsharp mask with radius / amount / threshold |
| Recover highlights, Lift shadows | Luminance-masked tone curve in linear light |
| Upscale 2× / 4× | Lanczos resampling, then a light sharpen |
| Despeckle | Connected-component labelling — clears islands of matte smaller than a threshold |
| Defringe | Edge colour decontamination by inward extrapolation of the interior colour |
| Clean up cut-out | Despeckle, then defringe, over the whole image or under a brush stroke |
| Object mask | Edge-aware flood from a scribble — the selection behind the blur below |
| Focus blur | Gaussian blur of one side of that mask, alpha-premultiplied |

It lives in **Enhance quality** on a selected image layer. The runtime is fetched on first use (about
15 MB, then browser-cached) and never blocks the UI. Results become a new asset, so Ctrl+Z restores the
previous version; enhancing after a cut-out operates on the cut-out, and alpha is preserved throughout —
every blur is alpha-premultiplied so transparent pixels cannot bleed in and darken a cut-out edge.

This also fixes two approximations called out below: tone and colour-temperature work now has a real
linear-light implementation here, and sharpening is a proper unsharp mask rather than a fixed 3×3
Laplacian. The canvas-filter versions remain for live slider feedback; the Python ones are what you reach
for when the source needs actual repair.

### Testing the Python

Two levels, because "it works under CPython" is not the same claim as "it works in the browser":

```
npm run test:python     # scripts/test_enhance.py — the maths, under desktop CPython
npm run verify:python   # scripts/verify-pyodide.mjs — the real thing, under Pyodide
```

`test_enhance.py` (43 checks) covers the colour round trip, blur energy and symmetry, that CLAHE raises
local contrast, that denoise smooths noise *without* flattening an edge, that sharpening does not darken
a cut-out edge, and that every operation is a no-op at zero strength.

`verify-pyodide.mjs` boots the actual Pyodide runtime in Node, loads numpy and Pillow, runs the same
`enhance.py` and the same FFI bridge the Web Worker uses, then compares the output **byte-for-byte
against desktop CPython** — all nine operations match exactly. That harness earned its place immediately:
it caught a bug where the worker called `.toJs()` on a value `to_js` had already converted, which would
have thrown on first use in the browser.

`npm run selftest` runs the Python unit tests too, and skips them cleanly when no local interpreter with
numpy is present (the browser build never needs one). `pyodide` is a devDependency used only by the
verification harness — the app loads its runtime from the CDN.

## Two formats, one engine

Thumbnails and Shorts covers are both first-class products, and the whole difference between them lives
in `src/data/formats.ts`: canvas size and presets, safe zones, toolbar order, export copy. The renderer,
interaction, layers, history, cut-out and export code is shared exactly as spec §39 requires.

| | Thumbnail | Shorts |
| --- | --- | --- |
| Canvas | 1280 × 720, 1920 × 1080 | 1080 × 1920, 720 × 1280, 2160 × 3840 |
| Safe zone | 4 / 11 / 3 / 3 % (duration chip, progress bar) | 9 / 20 / 4 / 13 % (search row, title block, action rail) |
| Toolbar | Brand first | Templates → Uploads → Text → Background first (§38) |
| Templates | 18 horizontal layouts | 12 vertical layouts |

Home opens with a **Create new design** chooser; the template gallery has a format switch; and turning a
canvas portrait in the properties panel converts the project to a Shorts cover on its own. Projects saved
before formats existed are migrated on open by `src/engine/normalize.ts` — portrait ones become Shorts,
and missing fields get defaults rather than crashing.

### Safe zone

Three regions, drawn on the editor canvas only: **restricted** (red — YouTube's own UI may cover it),
**warning** (amber — usable but crowded) and the clear **safe** area. Every inset is a percentage you can
edit per project, because the chrome differs across surfaces, with a one-click reset to the format's
defaults. The overlay is drawn in `CanvasStage`, outside `renderProject`, so it is structurally incapable
of reaching an export.

### Text auto-fit

`autoFit` on a text layer is `off`, `width` (shrink until every line fits the box) or `box` (fill both
axes). `fitFontSize` binary-searches the real wrapped layout, so it accounts for wrapping, letter
spacing and the highlight plate; **No wrap** keeps lines exactly where you break them. With auto-fit on,
retyping a headline re-sizes it and dragging the box re-fits it instead of scaling the type. Every
vertical template ships with auto-fit on its headline, so replacing the copy cannot break the layout.

### One-click creator effects and placement

`src/engine/quickActions.ts` holds the actions that should be faster than the sliders: Make pop, Make
bright, More contrast, Boost colours, Add outline / glow / shadow, Reset looks — all clamped to the
slider ranges. **Place subject** (Left / Centre / Right / Top / Bottom / Fill) re-sizes a cut-out for the
canvas and anchors it: on a vertical canvas the subject is sized to about half the height and anchored
above the title block, which is the composition Shorts covers actually use.

### Composition assistant

`src/engine/designAssistant.ts` is the client-side rules engine from §34, shown as **Readability** with a
0–100 score whenever nothing is selected. It checks headline size relative to the canvas (a Short fills
the screen, so it tolerates proportionally smaller text than a thumbnail in a 168 px grid cell), whether
anything important reaches into the covered area, bottom crowding, layer and word counts, and headline
contrast — including recognising that a stroke, plate or shadow is what separates the text when the
colours are close.

### Preview

A thumbnail is authored at 1280 px and met at 168. **Preview** therefore shows every real YouTube surface
at the width it actually gets — desktop home grid, channel page, playlist, watch-page sidebar, up-next
queue at 100 px, mobile feed and column, and the living-room shelf — each labelled with its width and the
percentage of your canvas it represents. For a Shorts cover the list changes to the Shorts surfaces,
including the player with the action rail, channel row and search row simulated over the art, so you can
see exactly what the app covers. The surface catalogue is `src/data/previewSurfaces.ts`; the dialog just
maps over it, so adding a placement is adding a row there.

### The score

At the top of Preview, a score out of 100 for **desktop** and for **mobile**, measured in Python over the
rendered pixels — the same idea as a vision API's image-properties analysis, run at the size each
platform actually shows.

| Metric | What is measured |
| --- | --- |
| Text contrast | WCAG contrast between each text layer's ink and whatever is behind it, after the design has been shrunk |
| Survives shrinking | How much of the picture changes on the trip down to the platform's width and back |
| Focal clarity | The share of the frame needed to hold half the attention, from a spectral-residual saliency map |
| Colour hierarchy | Whether one colour leads and the rest support |
| Tonal range | The spread between the near-darkest and near-brightest parts |
| Sharpness | Laplacian edge energy — catches a soft or over-upscaled source |
| Clear of the interface | How much of the attention falls where YouTube draws its own controls |

Two things make it more than a number. It is handed the **text boxes from the editor**, so it measures
contrast where the words actually are instead of guessing with OCR — and the occlusion rectangles come
from the project's own safe zone, so the score and the overlay can never disagree. And each platform
names its **weakest metric** with the fix for it, because "62/100" is not advice.

Desktop is judged at 360 px and mobile at 168 px. That is not a handicap: a 360 px card on a phone held
at reading distance covers about the same angle as a 168 px card on a monitor at arm's length.

Scoring runs on its own if the Python runtime is already warm, and is a button if it is not — opening
Preview should never quietly start a 15 MB download. `src/python/score.py` holds the measurements and
knows no English; `src/engine/thumbnailScore.ts` holds every label and every piece of advice.

Three things it does that a preview site does not:

- **Competing videos.** Every grid and row surface is flanked by neutral placeholder cards. The question
  a thumbnail has to answer is not "does this look good" but "does this win the row", and you cannot see
  that from a design sitting alone on a white page.
- **Both themes.** Dark is YouTube's default for most viewers, but a light-background design can dissolve
  into the page in light mode. One switch, no size changes.
- **Grayscale — the squint test.** If the design falls apart without colour, it is leaning on colour alone
  to separate the subject from the background, which is exactly what fails at 100 px.

Above the surfaces, a readout takes the smallest visible text layer and reports what it measures on the
smallest surface ("48 px renders at 3.8 px in the queue"), and says so plainly when that is below the
~10 px at which type stops being read. All the interface drawn around the artwork is simulated and is
never part of an export.

## Brand presets

A brand is data, not a screen: palette with per-colour budgets, type scale, element vocabulary,
backgrounds, cut-out treatment, and the rules its thumbnails must satisfy. `src/data/brands.ts` holds the
shape and the registry; the **Brand** panel, `engine/brandApply.ts` and `engine/brandQa.ts` are all driven
by whichever preset is selected, so adding a channel is adding a data file.

### Brand 1

Encoded from the channel's style guide — *"Simple design. Big impact."*

| | |
| --- | --- |
| Palette | `#181A1F` ground · `#F5F5F0` text · `#FFD43B` keyword · `#4DA3FF` support/icons · `#FF4D4D` alerts · `#9CA3AF` subtext |
| Fonts | Anton for headlines, Inter for everything else (Caveat only for the sticky-note aside) |
| Layout | Copy in the left 60%, creator plus **one** flat icon in the right 40% |
| Keyword | Exactly one word on the yellow block — the QA fails two, and fails zero |
| Photo | No white outline in this system; the creator is grounded by a soft shadow and a natural grade |
| Layouts | Why/because hook (the reference thumbnail), Stop doing this, Numbered promise, Mistake/warning, Light mode |

Five rules are machine-checked rather than written down: the 60/40 split (copy that strays into the
subject zone, or a subject on the wrong side, is flagged — a full-bleed photo is correctly read as a
backdrop instead), one highlighted keyword, headline word count, the dark-ground colour budget, and
palette adherence. That last one caught the preset itself during development: the "blue glow" background
I first shipped used `#1E3558`, a seventh colour the guide never sanctions, so it became a neutral ink
spotlight and blue stayed where the guide puts it — on icons and support elements.

The flat icon is an **empty slot** by design: drop in your Flaticon PNG or SVG. The panel carries the
reminder that the free tier needs attribution in the video description.

## The Brand 3 preset

Read off the channel's thumbnails rather than a written guide, so the rules describe what the work
consistently does:

- **The photograph fills the frame.** No cut-out, no illustrated background — the room, the desk and the
  gesture are the composition. This is the first brand here that does *not* want its subject cut out, so
  `cutout.requireCutout: false` tells the QA engine to stop asking for one.
- **A black shadow gives the copy a ground.** Straight down one side, along the bottom, or a hard
  diagonal wedge. Without it there is nowhere on a bright still for white type to live, which is why the
  scrims are element styles in the preset rather than something you improvise.
- **Sentence case, never capitals.** Inter 900 at 120–180 px, tight negative tracking, two to four words,
  hard against the left margin. The lower-case is half the brand.
- **Exactly one red mark.** A bar under the headline *or* a plate behind a single word — never both. The
  palette is black, white and red, full stop.

Four layouts ship: **Bottom line** (headline low, red rule beneath), **Left shadow** (copy left, gesture
right, one red word), **Angled shadow** (a hard edge leaning at 50°) and **Red plate**. Each is graded by the
selftest against its own preset, plus brand-specific checks: one scrim, one red mark, photo on the
bottom layer, headline in sentence case.

Adding this brand also corrected a rule for the other two. `title-words` used to count the single largest
text layer, but without per-word styling a highlighted keyword *has* to be its own layer — so "Stop /
cramming" was read as a one-word headline. The rule now counts the whole headline band (everything within
15% of the largest size), which is the sentence a viewer actually sees.

## Black shadow (scrim)

Any shape's fill can fade to transparent, which is what turns a rectangle into the scrim above. The
controls are in **Shadow** on a selected shape, and the **Shadows** category in Elements drops one in
covering the canvas:

| Control | Effect |
| --- | --- |
| Solid at | Which edge the fill is solid at — it fades away from there. `Edges` is a vignette, `Centre` a spotlight |
| Softness | 0 is a hard edge; 100 spreads the transition across the whole shape |
| Position | Where the transition sits across the shape |
| Angle | The lean of the shadow's edge, read like a protractor |

**Angle** starts at **90°** — square to the side the shadow comes from, which is the straight scrim — and
counts down as you use the slider: 80°, 70°, and so on to 10°, leaning the edge further towards a
diagonal each step. The shape itself never moves, so the canvas stays covered no matter how far the edge
leans; the gradient simply runs perpendicular to it. At exactly 90° the maths reduces to the plain
axis-aligned gradient, so a design made before the angle existed renders identically — which the selftest
checks for all four sides.

Opacity is the layer's opacity. Four presets cover the usual jobs: black left, black bottom, vignette and
the angled wedge. Rotating the layer still works and composes with the angle, but it is no longer needed
for a diagonal.

## The Brand 2 preset

The channel's design system is encoded as a first-class preset, not a pile of templates. It lives in
`src/data/brand.ts` (the system), `src/data/brandTemplates.ts` (layouts built from it) and
`src/engine/brandQa.ts` (the checklist that grades a design against it). Open it with **Brand** in the
left toolbar.

| Panel section | What it does |
| --- | --- |
| Set up brand canvas | Forces 1280 × 720 and the soft-paper ground |
| Layouts | Six brand layouts — flagship AI Notes, Before → After, Big hook, Problem → Solution, Three-card breakdown, Navy statement |
| Palette | The seven brand colours with their usage note and colour budget; a click paints the selection, or the background when nothing is selected |
| Type scale | The L1–L4 ladder plus brush label and handwritten note; a click restyles the selected text or drops in a new layer at the right size |
| Elements | Note card, navy panel, marker block, brush stroke, marker underline, blue/yellow arrow, check, sketch circle, tape, outer frame |
| Creator photo | Applies the cut-out treatment: 8 px white outline, 28% soft shadow, and the natural grade (contrast +10, highlights −10, shadows +10, sharpness +8) |
| Backgrounds | Soft paper, clean white, light blue wash, paper texture, note grid, navy panel |
| Final QA | The spec's pre-export checklist, evaluated live |

**The QA panel actually measures the design.** Canvas size, hook size and word count, prominent-word
count, the 60–80 px safe margin, palette adherence, cut-out outline width, shadow discipline and layer
count are all computed from the scene. The colour budget — 55–70% light ground, 15–25% navy, 8–15%
yellow, 3–8% blue — is measured by rendering the canvas at 200 px wide and bucketing every pixel to its
nearest brand colour, so photos, gradients and overlaps count exactly as the viewer sees them. Rules
that need human judgement (face recognisable, expression fits the topic) are listed as reminders rather
than faked.

Two things the QA is deliberately lenient about: greys below 25% saturation count as structural, not
off-palette, so note rules and muted labels do not trip the palette check; and the colour budget only
appears once a sample has been taken (it is debounced off the typing and dragging path).

The six brand layouts are themselves checked against the QA rules in `npm run selftest` — that is how
the first drafts were caught sitting 8–20 px inside the safe margin and one hook at 92 px instead of the
100–145 px band.

## Feather (layer masks)

Modelled on Premiere Pro's mask controls, in **Feather** on any layer — image, shape or text:

| Control | Premiere's name | What it does |
| --- | --- | --- |
| Shape · Edges / Oval | the mask path | A rectangle or ellipse inside the layer box |
| Shape · Subject | — | The layer's *own* alpha: a cut-out silhouette, or the letterforms of a text layer |
| Feather | Mask Feather | Width of the soft edge, in canvas pixels |
| Expand | Mask Expansion | Grows (+) or chokes (−) the mask before it is softened |
| Invert | Inverted | Hides the masked area instead of revealing it |

Four presets cover the usual jobs: **Soft edges** fades a photo's four sides into the background,
**Oval vignette** is the standard way to drop a portrait onto a backdrop, **Soften cut-out** takes the
hard digital edge off a segmented subject, and **Choke edge** pulls the matte in by a couple of pixels to
lose a bright rim.

Two details worth knowing:

- For a drawn region the falloff is placed *inside* the layer box (`maskInset` = half the feather, pushed
  back out by Expand), because a fade centred on the box edge would be cut in half by the edge itself and
  read as a hard 50% line. Expansion moves it back out and stops at the box, where there is nothing left
  to reveal.
- The mask is applied to the content **before** effects, so outline, glow, shadow and colour overlay are
  built from the feathered shape and follow it. `maskPadding` grows the layer's offscreen raster only for
  a Subject mask, which is the one kind that can spread past the box.

Expansion of a Subject mask is real morphology, not a blur trick: growing is the union of the silhouette
translated around a circle, and choking is the same dilation applied to the *inverse* and punched back
out. The outline effect now shares that one `dilate()` helper.

## Layers

Order is controlled from three places, all driving the same store actions:

- **Right-click the canvas** — bring to front / forward / backward / send to back, set as background,
  duplicate, group, lock, hide, delete. Right-clicking empty canvas offers the canvas-level actions.
- **Layers panel** — the four order buttons, drag-to-reorder, per-layer lock and hide.
- **Keyboard** — `]` to front, `⇧]` forward, `[` to back, `⇧[` backward.

**Set as canvas background** takes the image a layer is currently showing (the cut-out if one is
active), makes it the canvas backdrop and consumes the layer — so it sits behind everything, is not
selectable, and cannot be nudged by accident. "Set as background, keep layer" leaves the layer in place.
**Move background to a layer** is the inverse: it lifts the backdrop back onto the canvas as the bottom
layer, sized to cover, so you can crop, filter or cut it out. Both are single undo steps.

## Icons

A left-panel library of icons fetched live from the **Iconify API** (api.iconify.design) — open source,
MIT, no key, no account. Four categories built for study content — Education, Study, Time, Productivity —
and a search box that reaches the whole library.

Only four sets are offered: **Material Design Icons, Tabler (MIT), Phosphor (MIT) and Lucide (ISC)**.
All four are monochrome, which matters for the way colour works here.

Icons are fetched **in bulk, as data** — `{prefix}.json?icons=a,b,c` — not as one image per tile. A
category is one request per icon set, at most four, and the previews are then drawn from data already in
hand. (One request per tile is roughly fifty at once, and the API answers that with **429 Too Many
Requests**; a rate-limited grid looks exactly like a broken one.) Placing an icon needs no request either,
because the markup is built locally from the same data.

An icon arrives as an **ordinary image layer** rasterised at 1024 px, and that one decision is what gives
you everything else:

- **Colour** is the existing colour-overlay effect, not a property of the pixels. The raster is black; the
  overlay paints it. So recolouring is instant, works offline, and costs no round trip to the API.
- **Outline, glow and shadow** already build from any layer's silhouette, so they work on an icon with no
  new code — Effects, exactly as on a cut-out.
- **Size, rotation, opacity, feather, arrange** are the ordinary layer controls.
- The PNG is stored in IndexedDB like any upload, so a project that uses an icon **still opens with no
  connection**.

The photographic sections (Remove background, Enhance, Adjust, Filters, Crop) are hidden on an icon
layer: the overlay covers the pixels completely, so every one of those sliders would move nothing.

Icon bodies are third-party markup that ends up in the DOM to draw the previews, so `<script>`,
`<foreignObject>` and every `on*` handler are stripped on the way in.

## Colour psychology

A reference page for the question every thumbnail starts with: what should this colour *say*? Twelve
hues, each with the emotions it carries, the industries that lean on it, and what designers reach for it
to do — plus a tint and a shade of each, and its spectral band where it has one.

Open it from **Colour psychology** on the home screen, or from **View → Colour psychology…** in the
editor.

Two things make it more than a poster:

- **Search by intent.** Type `finance` and you get royal blue; `urgency` gives red; `growth` gives the
  greens. The search covers every emotion, industry and use, so you can arrive with a topic rather than
  a colour.
- **Contrast badges.** Each hue is measured (WCAG relative luminance) against a dark and a light ground
  at the 3:1 threshold for large text. Yellow reads on dark and vanishes on white; royal blue is the
  other way round. Meaning is convention, but this part is arithmetic.

Opened from the editor with layers selected, every hue gets an **Apply to selection** button: text takes
it as its colour, a shape as its fill, an icon as its colour overlay. Photographs are left alone —
recolouring one is a filter, not a fill. Applying is one undo step and drops you back on the canvas.
Clicking any swatch copies its hex.

## Background removal

Two engines behind one `removeBackground(asset, options)` call in `src/engine/backgroundRemoval.ts`,
picked with the **Engine** switch in the panel. Neither uploads the image anywhere.

**AI (default)** — the ISNet segmentation model via [`@imgly/background-removal`], running on ONNX
Runtime Web. This is the one for photographs: hair, complex edges, cluttered backdrops, and subjects
that touch the frame. The library and model are loaded on demand, so the editor still starts instantly;
the first run fetches ~40 MB of quantised model (`isnet_quint8`), which the browser then caches.

**Fast** — the built-in multi-seed flood fill in `src/engine/cutout.ts`: every border pixel seeds a
region and neighbours join while they stay within tolerance, so whatever the frame can reach is removed.
Instant, no download, always available offline, and still the better tool for flat or smoothly graded
backdrops, screen recordings and logos. Exposes **tolerance** and **refine edge**.

If the model cannot be fetched (offline first run), the panel says so and switches to Fast rather than
failing. The result is a normal transparent PNG layer, so outline/glow/shadow apply to the cut-out
silhouette.

### Cleaning up what the remover leaves behind

Segmentation reliably leaves two kinds of debris, and neither is fixable by rubbing with an eraser:
stray specks of the old background floating in the empty area, and edge pixels whose colour is still a
blend with that background — the bright halo you see around hair when the subject was shot against a
light wall. Both need to look at a pixel's *neighbourhood*, so both are done in Python (numpy), in the
same worker as the enhancement pipeline.

- **Clean up cut-out** (button, under Remove background) — one pass over the whole matte. `despeckle`
  labels every 8-connected island of alpha and drops the ones smaller than a threshold; the largest
  island is the subject and is never a candidate, which is what makes it safe to run aggressively.
  `defringe` then replaces the colour of partly transparent edge pixels with the nearest solid interior
  colour, carried outward by a normalised blur, so the rim keeps its shape and loses the halo. **Edge
  clean** is the decontamination strength; **Tighten edge** raises the transparency floor to shave the
  faintest rim pixels.
- **Clean brush** — for specks the one-click pass leaves (or ones you would rather keep elsewhere). Drag
  over them: the stroke is collected as a coverage mask rather than erasing anything, and on release the
  whole image is labelled and only components that are mostly under the stroke and smaller than the
  brush disc are removed. So the brush cannot take a bite out of the subject even if you drag straight
  across it, and the edge work is confined to the patch you touched. One stroke is one Python pass, one
  new asset and one undo step.
- **Erase / restore brush** — the manual fallback, for anything structural.

Because the clean-up registers a new asset rather than mutating the existing one, Ctrl+Z restores the
previous cut-out exactly.

### Object mask and blur

Premiere Pro's object masking, done here: **scribble on a thing and its shape is found for you**, then
either it or everything around it is blurred. It is under **Object mask & blur** on any image layer — a
cut-out is not needed, because the mask is a selection rather than a cut.

- **Blur behind** — scribble over the subject and the rest of the frame softens. This is the
  depth-of-field look: the creator stays sharp, the room falls away, and the headline has somewhere
  quiet to sit.
- **Blur this** — scribble over the clutter instead (the desk, the bookshelf, a logo you cannot show)
  and it is the only thing that goes soft.

The selection itself is `select_object` in `enhance.py`, and it is deliberately not a colour pick:

- Growth is gated **twice**. A neighbouring pixel joins only if the step to it is small — an edge stops
  the flood — *and* its colour is still close to the scribble's own. Without the second gate a long
  gradient walks the selection off the object one imperceptible step at a time; without the first, two
  objects of the same colour merge.
- The scribble's own bounding box, grown by `spread`, **bounds** the result, with a floor of 8% of the
  frame so a single dab on a face still means the whole face. One leak through a shadow would otherwise
  hand back the entire image with no clue as to why.
- The flood runs on a **320 px downsample**. The mask is feathered before it is used, so nothing is lost
  in the detail, and a 4K still selects as fast as a small one.
- Holes are closed (dilate, then erode by the same amount) so a specular highlight or a printed logo
  does not punch a sharp hole in an otherwise blurred object.

You do not have to be neat, and you do not have to get the strength right first time: the stroke is
remembered, so moving **Strength** (or switching direction) re-runs from the *original* pixels rather
than blurring an already blurred image. It reads out in pixels of the source, so you can see whether a
setting is going to show at all. Sliding it back to zero restores them exactly. Every pass registers a new asset,
so Ctrl+Z steps back through them, and the Python runs on release rather than on every pixel of the
drag. Every control sits in the panel; the bar on the canvas carries only the brush size.

Budget about a second for a 1280×720 still and a few for a 4K source — heavy blurs are computed on a
downsample, since nothing finer than the blur radius survives one anyway.

**Fit to canvas** (right-click a layer) covers the frame with it, edge to edge. A photograph fills the
canvas and the overflow is *cropped* rather than stretched, so a face keeps its proportions; anything
else is scaled to fit inside and centred. Either way the layer is levelled, since a tilted one cannot
line up with the frame.

### Cropping

A cut-out layer still carries the whole original photo's frame, mostly transparent — which makes the
outline pad empty space, resize handles grab nothing, and **Place subject** anchor the wrong box. So the
crop tool sits right next to the removal controls:

- **Crop to subject** — scans the cut-out's alpha, trims to the subject's bounding box (plus 1% breathing
  room so outlines and glows are not clipped) and moves the layer box so the subject does not shift.
- **Crop on canvas** — double-click a photo, press `C`, or use the panel button. Drag the edges to crop,
  drag inside to pan the photo under the crop, `Enter` applies and `Escape` cancels. The discarded part
  of the image stays visible, ghosted, so you can see what you are cutting away and pan it back.

The crop model is a normalised source rect (`ImageObject.crop`) plus the layer box. `engine/crop.ts`
keeps them consistent: `applyCropRect` moves the box with the crop so surviving pixels stay exactly where
they were — including on rotated and flipped layers, which is what the self-test pins down. Cancelling is
an undo of the snapshot taken when crop mode opened.

### Running the model offline

```
npm run fetch-model              # quantised model + CPU runtime into public/bg-model (~54 MB)
npm run fetch-model -- --gpu     # also the WebGPU runtime (+22 MB)
npm run fetch-model -- --verify  # fetch only the small loaders, to check the setup works
```

Then set `VITE_BG_MODEL_PATH=/bg-model/` (see `.env.example`). The script version-matches the data to
the installed library — the manifest format differs between versions — and skips chunks already on disk.
`public/bg-model/` is gitignored.

> The production build emits a ~24 MB `ort-wasm-simd-threaded.jsep.wasm` asset that ONNX Runtime
> references statically. It is not fetched at runtime (the library supplies its own runtime binary), but
> it does sit in `dist/`; delete it from a deploy if size matters.

[`@imgly/background-removal`]: https://github.com/imgly/background-removal-js

### Known approximations

- The live sliders are canvas-speed approximations: `temperature`, `tint`, `highlights` and `shadows` are
  blend layers rather than a true tone curve, `brightness`/`contrast`/`saturation`/`exposure`/`blur` map
  to native canvas filters, and `sharpness` is a fixed 3×3 Laplacian. When a source needs real work, the
  Python engine above does it properly and bakes the result into the asset.
- Letter spacing uses `ctx.letterSpacing` where available and falls back to per-character drawing, which
  loses kerning on older engines.
- Groups are flat (a shared `groupId`), not nested containers.

## Keyboard shortcuts

| | |
| --- | --- |
| `Ctrl/⌘ Z` / `Ctrl ⇧ Z`, `Ctrl Y` | Undo / redo |
| `Ctrl C` / `Ctrl V` / `Ctrl D` | Copy / paste / duplicate |
| `Delete` / `Backspace` | Delete selection |
| `Ctrl A` | Select all |
| `Ctrl G` / `Ctrl ⇧ G` | Group / ungroup |
| `Ctrl S` / `Ctrl E` | Save / export |
| `Ctrl +` / `Ctrl -` / `Ctrl 0` | Zoom in / out / fit |
| `]` / `⇧]` / `[` / `⇧[` | To front / forward / to back / backward |
| `C`, double-click a photo | Crop on canvas (`Enter` apply, `Esc` cancel) |
| Arrows, `⇧` Arrows | Nudge by 1 px / 10 px |
| `Ctrl` + scroll | Zoom the canvas |
| Double-click text | Edit in place |
| `⇧` drag | Constrain move / aspect / 15° rotation |

## Testing

`npm run selftest` bundles `scripts/selftest.ts` with esbuild and runs it in Node — 288 checks over the
parts that are pure logic and easy to get subtly wrong:

- the flood-fill cut-out, including a background region enclosed by the subject;
- the rotated-resize maths that must keep the anchor corner fixed at 0°/30°/−75°/145°;
- filter-strength interpolation and aspect-preserving crop fitting;
- layer ordering, set-as-background and its inverse, and that both are undoable;
- text layout: that a highlight plate always wraps the ink it sits behind, with equal padding above and
  below, whatever the font's metrics claim;
- cropping: that a crop never moves the pixels it keeps, at three rotations and under both flips, plus
  clamping, panning and the alpha scan behind "Crop to subject";
- the brand presets: palette buckets, type scales against their own bands, colour-budget measurement,
  every brand layout graded by its own preset's QA rules, and proof that those rules bite — two
  highlighted keywords, a subject on the wrong side or copy in the subject zone all get flagged;
- the Shorts format: safe-zone geometry, legacy-project migration, auto-fit sizing, quick actions and
  their clamping, subject placement on a vertical canvas, the assistant's rules (including that it
  actually fails a buried headline and low contrast), and all twelve vertical layouts.

Rendering and interaction are not covered — those need a browser.

/**
 * Headless checks for the parts of the editor that are pure logic: the cut-out
 * algorithm, the transform maths behind dragging/resizing, filter scaling and
 * crop fitting. Run with `npm run selftest`.
 */
import { applyCutout, floodFillBackground } from '../src/engine/cutout'
import { coverCrop } from '../src/engine/crop'
import { scaleFilter } from '../src/data/filters'
import { boundingRect, handlePoints, hitTest, rotatePoint, toLocal } from '../src/engine/geometry'
import { createImage, createShape, createText } from '../src/engine/factory'
import { DEFAULT_EFFECTS, type Project, type SceneObject } from '../src/types'

/** A deliberately over-the-top glow, used to prove the QA rules bite. */
const DEEP_GLOW = {
  ...DEFAULT_EFFECTS,
  glow: { enabled: true, color: '#FFD21F', blur: 60, intensity: 3 },
}

let failures = 0

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ok   ${name}`)
  } else {
    failures++
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function near(a: number, b: number, epsilon = 0.001) {
  return Math.abs(a - b) <= epsilon
}

// --------------------------------------------------------------- cut-out ---
console.log('cutout')
{
  // A red subject on a blue background, with a blue "hole" inside the subject
  // that the frame cannot reach.
  const w = 60
  const h = 40
  const data = new Uint8ClampedArray(w * h * 4)
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * 4
    data[i] = r
    data[i + 1] = g
    data[i + 2] = b
    data[i + 3] = 255
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) set(x, y, 20, 40, 220)
  for (let y = 10; y < 30; y++) for (let x = 20; x < 40; x++) set(x, y, 230, 30, 30)
  for (let y = 18; y < 22; y++) for (let x = 28; x < 32; x++) set(x, y, 20, 40, 220)

  const mask = floodFillBackground(data, w, h, 18)
  const at = (x: number, y: number) => mask[y * w + x]
  check('frame pixels are background', at(0, 0) === 0 && at(w - 1, h - 1) === 0)
  check('subject is kept', at(25, 15) === 255)
  check('enclosed background is kept (not reachable from the frame)', at(29, 19) === 255)

  const copy = data.slice()
  applyCutout(copy, w, h, { tolerance: 18, feather: 0 })
  check('background alpha cleared', copy[3] === 0)
  check('subject alpha preserved', copy[((15 * w + 25) * 4) + 3] === 255)

  // A noisy gradient background still clears from the edges at high tolerance.
  const gradient = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const inside = x >= 20 && x < 40 && y >= 10 && y < 30
      gradient[i] = inside ? 240 : 30 + x
      gradient[i + 1] = inside ? 20 : 40 + y
      gradient[i + 2] = inside ? 20 : 200
      gradient[i + 3] = 255
    }
  }
  const gradientMask = floodFillBackground(gradient, w, h, 12)
  check('gradient background removed', gradientMask[0] === 0 && gradientMask[w * h - 1] === 0)
  check('subject survives a gradient background', gradientMask[15 * w + 25] === 255)

  let lastProgress = 0
  applyCutout(data, w, h, {
    tolerance: 18,
    feather: 2,
    onProgress: (p) => {
      lastProgress = p
    },
  })
  check('progress reaches 1', near(lastProgress, 1))
}

// -------------------------------------------------------------- geometry ---
console.log('geometry')
{
  const obj = createShape({ x: 100, y: 50, width: 200, height: 100, rotation: 0 })
  check('hit inside', hitTest({ x: 150, y: 80 }, obj))
  check('miss outside', !hitTest({ x: 40, y: 80 }, obj))

  const rotated = { ...obj, rotation: 90 } as SceneObject
  // Rotating 90° about the centre swaps the visual extents.
  const bounds = boundingRect([rotated])!
  check('rotated bounds swap width and height', near(bounds.width, 100) && near(bounds.height, 200))
  check('rotated centre unchanged', near(bounds.x + bounds.width / 2, 200) && near(bounds.y + bounds.height / 2, 100))

  const corner = rotatePoint({ x: 0, y: 0 }, { x: 0, y: 0 }, 45)
  check('rotating about itself is a no-op', near(corner.x, 0) && near(corner.y, 0))

  const local = toLocal({ x: 100, y: 50 }, obj)
  check('top-left maps to local origin', near(local.x, 0) && near(local.y, 0))

  // Resize maths (mirrors CanvasStage.applyResize): dragging the SE handle of a
  // rotated object must leave the NW corner exactly where it was.
  for (const rotation of [0, 30, -75, 145]) {
    const start = createShape({ x: 100, y: 50, width: 200, height: 100, rotation })
    const anchor = rotatePointAround({ x: start.x, y: start.y }, start, rotation)
    const width = 260
    const height = 160
    const center = rotatePoint({ x: anchor.x + width / 2, y: anchor.y + height / 2 }, anchor, rotation)
    const next = {
      ...start,
      width,
      height,
      x: center.x - width / 2,
      y: center.y - height / 2,
    }
    const nwAfter = rotatePointAround({ x: next.x, y: next.y }, next, rotation)
    check(
      `resize keeps the anchor fixed at ${rotation}°`,
      near(nwAfter.x, anchor.x, 0.01) && near(nwAfter.y, anchor.y, 0.01),
      `${JSON.stringify(nwAfter)} vs ${JSON.stringify(anchor)}`,
    )
  }

  const handles = handlePoints(createShape({ x: 0, y: 0, width: 100, height: 100, rotation: 0 }))
  check('se handle sits on the far corner', near(handles.se.x, 100) && near(handles.se.y, 100))
  check('rotate handle sits above the box', handles.rotate.y < 0)
}

function rotatePointAround(point: { x: number; y: number }, obj: { x: number; y: number; width: number; height: number }, rotation: number) {
  return rotatePoint(point, { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 }, rotation)
}

// --------------------------------------------------------------- filters ---
console.log('filters')
{
  check('full strength is unchanged', scaleFilter('saturate(1.6) contrast(1.12)', 100) === 'saturate(1.6) contrast(1.12)')
  check('zero strength collapses to identity', scaleFilter('saturate(1.6) contrast(1.12)', 0) === 'saturate(1) contrast(1)')
  check('half strength interpolates', scaleFilter('saturate(2)', 50) === 'saturate(1.5)')
  check('sepia identity is 0', scaleFilter('sepia(0.4)', 50) === 'sepia(0.2)')
  check('degrees interpolate from 0', scaleFilter('hue-rotate(180deg)', 50) === 'hue-rotate(90deg)')
  check('empty filter stays empty', scaleFilter('', 50) === '')
}

// ------------------------------------------------------------ text layout ---
console.log('text layout')
{
  const { lineGeometry, contentHeight, fallbackInk } = await import('../src/engine/text')

  // Anton-like metrics at 132 px: tall caps, almost no descender in caps text.
  const caps = { ascent: 94, descent: 2 }
  const lineHeight = 132 * 1.02
  const padding = 18
  const geometry = lineGeometry(lineHeight, caps, padding)

  check('the plate wraps the ink plus its padding', near(geometry.plateHeight, caps.ascent + caps.descent + padding * 2))
  check('the baseline puts the ink inside the plate', geometry.baseline - caps.ascent >= geometry.plateTop)
  check(
    'the ink is centred in the plate',
    near(geometry.baseline - caps.ascent - geometry.plateTop, geometry.plateTop + geometry.plateHeight - (geometry.baseline + caps.descent), 0.01),
  )
  check('padding above the caps equals the padding below', near(geometry.baseline - caps.ascent - geometry.plateTop, padding))

  // The regression: with a 1.02 line height and a font box of ~1.3 em, the old
  // 'middle' baseline pushed caps above the plate. The ink must now stay in.
  const fontBox = { ascent: 132 * 1.05, descent: 132 * 0.25 }
  const tight = lineGeometry(lineHeight, caps, padding)
  check('caps never sit above the plate top', tight.baseline - caps.ascent > tight.plateTop - 0.001)
  check(
    'a font box taller than the line box is reported as overflow',
    lineGeometry(lineHeight, fontBox, padding).plateTop < 0,
  )
  check('an ink box that fits produces no overflow', tight.plateTop >= 0)

  check('descenders extend the plate downward', (() => {
    const mixed = lineGeometry(lineHeight, { ascent: 94, descent: 28 }, padding)
    return mixed.plateHeight > geometry.plateHeight
  })())

  const object = createText({ text: 'ONE\nTWO', fontSize: 132, lineHeight: 1.02, bgEnabled: true, bgPadding: padding })
  // (n − 1) line boxes, plus whichever is taller for the last one.
  check('two lines reserve two line boxes', near(contentHeight(2, lineHeight, caps, object), lineHeight * 2))
  check(
    'the last line reserves the plate when it is taller',
    near(contentHeight(2, lineHeight, { ascent: 120, descent: 20 }, object), lineHeight + 120 + 20 + padding * 2),
  )
  check('a tight line height still reserves the plate', (() => {
    const squashed = contentHeight(1, 100, { ascent: 94, descent: 2 }, object)
    return squashed >= 94 + 2 + padding * 2
  })())
  check('uppercase text gets a small fallback descent', fallbackInk({ ...object, uppercase: true }).descent < fallbackInk({ ...object, uppercase: false }).descent)
}

// ------------------------------------------------------------------ crop ---
console.log('crop')
{
  const wide = coverCrop(16 / 9, 1) // wide image into a square slot
  check('wide image is cropped horizontally', wide.height === 1 && wide.width < 1)
  check('wide crop is centred', near(wide.x, (1 - wide.width) / 2))
  const tall = coverCrop(3 / 4, 16 / 9)
  check('tall image is cropped vertically', tall.width === 1 && tall.height < 1)
  const same = coverCrop(16 / 9, 16 / 9)
  check('matching aspect needs no crop', near(same.width, 1) && near(same.height, 1))

  const { applyCropRect, boxFromCrop, boundsFromAlpha, cropFromBox, fullFrameRect, intersectCrop, normalizeCrop, panCrop } =
    await import('../src/engine/crop')

  const photo = createImage('a', 1000, 500, 1280, 720, { x: 100, y: 60, width: 800, height: 400 })

  check('an uncropped layer maps to its own box', (() => {
    const full = fullFrameRect(photo)
    return near(full.x, 100) && near(full.y, 60) && near(full.width, 800) && near(full.height, 400)
  })())
  check('a cropped layer knows where the whole photo would sit', (() => {
    const half = { ...photo, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }
    const full = fullFrameRect(half)
    return near(full.width, 1600) && near(full.height, 800) && near(full.x, 100 - 400) && near(full.y, 60 - 200)
  })())

  check('box → crop → box is a round trip', (() => {
    const box = { x: 300, y: 160, width: 400, height: 200 }
    const back = boxFromCrop(photo, cropFromBox(photo, box))
    return near(back.x, box.x, 0.01) && near(back.y, box.y, 0.01) && near(back.width, box.width, 0.01)
  })())

  // The point of applyCropRect: surviving pixels must not move on the canvas.
  const cornerOf = (obj: typeof photo) => {
    // Scene position of the source point that sits at the crop's top-left.
    const centre = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 }
    return rotatePoint({ x: obj.x, y: obj.y }, centre, obj.rotation)
  }
  for (const rotation of [0, 35, -120]) {
    for (const [flipH, flipV] of [
      [false, false],
      [true, false],
      [false, true],
    ] as const) {
      const start = { ...photo, rotation, flipH, flipV }
      const next = { x: 0.2, y: 0.1, width: 0.5, height: 0.6 }
      const cropped = { ...start, ...applyCropRect(start, next) }
      // Map the new crop's top-left back through the old layer: it must land in
      // the same scene position as the new layer's own top-left corner.
      const expectedBox = boxFromCrop(start, next)
      const startCentre = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
      const expected = rotatePoint({ x: expectedBox.x, y: expectedBox.y }, startCentre, rotation)
      const actual = cornerOf(cropped)
      check(
        `crop keeps pixels in place (rot ${rotation}, flip ${flipH ? 'H' : ''}${flipV ? 'V' : ''}${!flipH && !flipV ? 'none' : ''})`,
        near(expected.x, actual.x, 1.5) && near(expected.y, actual.y, 1.5),
        `${JSON.stringify(expected)} vs ${JSON.stringify(actual)}`,
      )
    }
  }

  check('crop values are clamped into range', (() => {
    const c = normalizeCrop({ x: -0.5, y: 0.9, width: 2, height: 0.4 })
    return c.x === 0 && c.width === 1 && c.y + c.height <= 1.0001
  })())
  check('cropFromBox cannot escape the photo', (() => {
    const c = cropFromBox(photo, { x: -500, y: -500, width: 4000, height: 4000 })
    return c.x >= 0 && c.y >= 0 && c.width <= 1 && c.height <= 1
  })())

  check('panning moves the crop window, not the box', (() => {
    const zoomed = { ...photo, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }
    const panned = panCrop(zoomed, 80, 0)
    return panned.x < zoomed.crop.x && near(panned.width, 0.5)
  })())
  check('panning a flipped layer follows the drag', (() => {
    const zoomed = { ...photo, flipH: true, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } }
    return panCrop(zoomed, 80, 0).x > zoomed.crop.x
  })())
  check('panning stops at the edge', (() => {
    const zoomed = { ...photo, crop: { x: 0, y: 0, width: 0.5, height: 0.5 } }
    return panCrop(zoomed, 5000, 5000).x === 0
  })())

  check('intersecting crops keeps the overlap', (() => {
    const c = intersectCrop({ x: 0, y: 0, width: 1, height: 1 }, { x: 0.2, y: 0.2, width: 0.5, height: 0.5 })
    return near(c.x, 0.2) && near(c.width, 0.5)
  })())
  check('disjoint crops fall back to the original', (() => {
    const a = { x: 0, y: 0, width: 0.2, height: 0.2 }
    const c = intersectCrop(a, { x: 0.8, y: 0.8, width: 0.2, height: 0.2 })
    return c === a
  })())

  // Alpha scan behind "Crop to subject".
  const subjectPixels = (width: number, height: number, box: { x: number; y: number; w: number; h: number }) => {
    const data = new Uint8ClampedArray(width * height * 4)
    for (let y = box.y; y < box.y + box.h; y++) {
      for (let x = box.x; x < box.x + box.w; x++) data[(y * width + x) * 4 + 3] = 255
    }
    return data
  }
  const bounds = boundsFromAlpha(subjectPixels(100, 100, { x: 20, y: 30, w: 40, h: 20 }), 100, 100)!
  check('alpha bounds find the subject', near(bounds.x, 0.2) && near(bounds.y, 0.3) && near(bounds.width, 0.4) && near(bounds.height, 0.2))
  check('a fully transparent image has no bounds', boundsFromAlpha(new Uint8ClampedArray(64 * 64 * 4), 64, 64) === null)
  check('a faint fringe is ignored', (() => {
    const data = subjectPixels(100, 100, { x: 40, y: 40, w: 10, h: 10 })
    data[3] = 8 // stray near-transparent pixel in the corner
    return boundsFromAlpha(data, 100, 100)!.x >= 0.39
  })())
}

// ------------------------------------------------------------- factories ---
console.log('factories')
{
  const a = createText()
  const b = createText()
  check('object ids are unique', a.id !== b.id)
  const shape = createShape({ shape: 'star', points: 6 })
  check('shape overrides apply', shape.shape === 'star' && shape.points === 6)
  check('effects are not shared between objects', createText().effects !== createText().effects)
}

// ---------------------------------------------------------------- layers ---
console.log('layers')
{
  const { useEditor } = await import('../src/store/editorStore')
  const store = useEditor.getState()

  store.newProject(1280, 720, 'Layer test')
  const bottom = createShape({ name: 'bottom' })
  const middle = createShape({ name: 'middle' })
  const top = createShape({ name: 'top' })
  store.addObjects([bottom, middle, top])
  const names = () => useEditor.getState().project.objects.map((o) => o.name).join(',')
  check('objects stack bottom-up in order added', names() === 'bottom,middle,top')

  store.moveLayer(bottom.id, 'front')
  check('bring to front', names() === 'middle,top,bottom')
  store.moveLayer(bottom.id, 'back')
  check('send to back', names() === 'bottom,middle,top')
  store.moveLayer(bottom.id, 'forward')
  check('send forward one step', names() === 'middle,bottom,top')
  store.moveLayer(bottom.id, 'backward')
  check('send backward one step', names() === 'bottom,middle,top')
  store.moveLayer(top.id, 'forward')
  check('forward at the top is a no-op', names() === 'bottom,middle,top')
  store.moveLayer(bottom.id, 'backward')
  check('backward at the bottom is a no-op', names() === 'bottom,middle,top')

  store.moveLayer(middle.id, 'front')
  check('front moves the right layer', names() === 'bottom,top,middle')
  useEditor.getState().undo()
  check('layer moves are undoable', names() === 'bottom,middle,top')

  // Set as background, and back again.
  const photo = createImage('asset-1', 1600, 900, 1280, 720, { name: 'Photo' })
  store.addObject(photo)
  store.setAsBackground(photo.id)
  const afterBackground = useEditor.getState().project
  check('background takes the layer asset', afterBackground.background.kind === 'image' && afterBackground.background.assetId === 'asset-1')
  check('layer is consumed', !afterBackground.objects.some((o) => o.id === photo.id))
  check('selection is cleared', useEditor.getState().selection.length === 0)

  useEditor.getState().undo()
  const restored = useEditor.getState().project
  check('set as background is undoable', restored.objects.some((o) => o.id === photo.id) && restored.background.kind !== 'image')

  useEditor.getState().redo()
  useEditor.getState().backgroundToLayer()
  const detached = useEditor.getState().project
  const layer = detached.objects[0]
  check('background returns as the bottom layer', layer?.type === 'image' && layer.assetId === 'asset-1')
  check('detached layer covers the canvas', layer?.width === 1280 && layer?.height === 720)
  check('background is no longer an image', detached.background.kind === 'solid' && detached.background.assetId === null)

  store.setAsBackground(layer.id, { keepLayer: true })
  const kept = useEditor.getState().project
  check('keepLayer leaves the layer in place', kept.objects.some((o) => o.id === layer.id) && kept.background.kind === 'image')

  const text = createText({ text: 'not an image' })
  store.addObject(text)
  const before = useEditor.getState().project.objects.length
  store.setAsBackground(text.id)
  check('non-image layers cannot become the background', useEditor.getState().project.objects.length === before)
}

// ------------------------------------------------------------- brand: Brand 2
console.log('brand preset')
{
  const { BRAND_TEMPLATES } = await import('../src/data/brandTemplates')
  const { TEMPLATES } = await import('../src/data/templates')
  const { CANVAS, PALETTE, TEXT_STYLES, ELEMENT_STYLES, CUTOUT_EFFECTS, OUTLINE_RANGE } = await import('../src/data/brand')
  const { runBrandQa, nearestRole, hexToRgb, usedColors } = await import('../src/engine/brandQa')
  const { brandTextObject, brandElementObject, cutoutPatch } = await import('../src/engine/brandApply')
  const { RANJAN_NOTES } = await import('../src/data/brand')

  const ids = new Set(TEMPLATES.map((t) => t.id))
  check('brand templates are in the gallery', BRAND_TEMPLATES.every((t) => ids.has(t.id)))
  check(
    'the gallery tags every brand layout with its brand',
    TEMPLATES.filter((t) => BRAND_TEMPLATES.some((b) => b.id === t.id)).every((t) => t.brand === 'ranjan-notes'),
  )

  // Palette buckets must be distinguishable from each other.
  const collisions = PALETTE.filter((c) => nearestRole(hexToRgb(c.hex)!, RANJAN_NOTES) !== c.role)
  check('every brand colour maps to its own role', collisions.length === 0, collisions.map((c) => c.name).join(', '))
  check('off-brand colours are rejected', nearestRole(hexToRgb('#8B5CF6')!, RANJAN_NOTES) === null)

  check(
    'type scale sizes sit inside their declared bands',
    TEXT_STYLES.every((s) => {
      const size = s.apply.fontSize ?? 0
      return size >= s.range[0] && size <= s.range[1]
    }),
  )
  check('cut-out outline is within the 5–10 px rule', (() => {
    const { width } = CUTOUT_EFFECTS.outline
    return CUTOUT_EFFECTS.outline.enabled && width >= OUTLINE_RANGE[0] && width <= OUTLINE_RANGE[1]
  })())
  check('cut-out patch carries outline and grade', (() => {
    const patch = cutoutPatch(RANJAN_NOTES)
    return patch.effects?.outline.enabled === true && patch.adjustments?.sharpness === 8
  })())

  const { DEFAULT_BACKGROUND } = await import('../src/types')
  const { defaultSafeZone } = await import('../src/data/formats')
  const canvasProject: Project = {
    id: 'p',
    name: 'QA',
    format: 'thumbnail',
    brandId: 'ranjan-notes',
    width: CANVAS.width,
    height: CANVAS.height,
    safeZone: defaultSafeZone('thumbnail'),
    background: { ...DEFAULT_BACKGROUND },
    objects: [] as SceneObject[],
    createdAt: 0,
    updatedAt: 0,
  }

  // Every brand layout must pass the parts of its own QA list that can be measured.
  for (const template of BRAND_TEMPLATES) {
    const built = template.build(CANVAS.width, CANVAS.height)
    const project = { ...canvasProject, background: built.background, objects: built.objects }
    const items = runBrandQa(project, null, RANJAN_NOTES)
    const failed = items.filter((i) => i.status === 'fail' || i.status === 'warn')
    check(
      `template "${template.name}" passes brand QA`,
      failed.length === 0,
      failed.map((f) => `${f.id}: ${f.detail}`).join(' | '),
    )
  }

  // QA must actually catch violations, not just say yes.
  const offBrand = {
    ...canvasProject,
    width: 1000,
    height: 700,
    objects: [createText({ text: 'a really long headline that says far too much at once', fontSize: 40, x: 10, y: 10, color: '#8B5CF6' })],
  }
  const badItems = runBrandQa(offBrand, null, RANJAN_NOTES)
  const status = (id: string) => badItems.find((i) => i.id === id)?.status
  check('QA fails a wrong canvas size', status('canvas') === 'fail')
  check('QA fails a small headline', status('headline') === 'fail')
  check('QA warns on too many title words', status('title-words') === 'warn')
  check('QA warns on text outside the safe margin', status('margin') === 'warn')
  check('QA warns on an off-palette colour', status('palette') === 'warn')
  check('QA reports colour budgets only when sampled', !badItems.some((i) => i.id === 'budget:yellow'))

  const glowing = {
    ...canvasProject,
    objects: [createText({ text: 'HOOK', fontSize: 120, x: 100, y: 100, effects: { ...DEEP_GLOW } })],
  }
  check('QA warns on glow', runBrandQa(glowing, null, RANJAN_NOTES).find((i) => i.id === 'shadows')?.status === 'warn')

  check('brand text objects land inside the safe area', (() => {
    const object = brandTextObject(RANJAN_NOTES, 'hook', canvasProject)
    return object.x >= CANVAS.safeMargin && object.x + object.width <= CANVAS.width - CANVAS.safeMargin
  })())
  check('brand elements are centred', (() => {
    const object = brandElementObject(RANJAN_NOTES, 'card', canvasProject)
    return Math.abs(object.x + object.width / 2 - CANVAS.width / 2) < 2
  })())
  check('the outer frame element covers the canvas', (() => {
    const frame = brandElementObject(RANJAN_NOTES, 'frame', canvasProject)
    return frame.x === 0 && frame.y === 0 && frame.width === CANVAS.width && frame.height === CANVAS.height
  })())
  check('every element style is reachable', ELEMENT_STYLES.every((e) => !!brandElementObject(RANJAN_NOTES, e.id, canvasProject)))
  // Colour budget: build a canvas that is 60% white / 20% navy / 10% yellow /
  // 5% blue / 5% off-brand and check the QA verdicts that follow from it.
  {
    const { shareFromPixels } = await import('../src/engine/brandQa')
    const mix: [number, [number, number, number]][] = [
      [60, [255, 255, 255]],
      [20, [7, 21, 37]],
      [10, [255, 210, 31]],
      [5, [22, 119, 255]],
      [5, [139, 92, 246]],
    ]
    const pixels = new Uint8ClampedArray(100 * 4)
    let at = 0
    for (const [count, [r, g, b]] of mix) {
      for (let i = 0; i < count; i++, at++) {
        pixels[at * 4] = r
        pixels[at * 4 + 1] = g
        pixels[at * 4 + 2] = b
        pixels[at * 4 + 3] = 255
      }
    }
    const share = shareFromPixels(pixels, RANJAN_NOTES)
    check('colour sampling measures the palette', near(share.white, 60) && near(share.ink, 20) && near(share.yellow, 10) && near(share.blue, 5))
    check('off-brand pixels land in "other"', near(share.other, 5))

    const budgeted = runBrandQa(
      { ...canvasProject, objects: [createText({ text: 'BIG HOOK', fontSize: 120, x: 100, y: 100 })] },
      share,
      RANJAN_NOTES,
    )
    const status = (id: string) => budgeted.find((i) => i.id === id)?.status
    check('light ground within budget passes', status('ground') === 'pass')
    check('navy within budget passes', status('budget:ink') === 'pass')
    check('yellow within budget passes', status('budget:yellow') === 'pass')
    check('blue within budget passes', status('budget:blue') === 'pass')

    const yellowHeavy = { ...share, yellow: 34, white: 36 }
    const loud = runBrandQa(canvasProject, yellowHeavy, RANJAN_NOTES)
    check('too much yellow is flagged', loud.find((i) => i.id === 'budget:yellow')?.status === 'warn')
    check('too little light ground is flagged', loud.find((i) => i.id === 'ground')?.status === 'warn')
  }

  check('usedColors reads background and layers', (() => {
    const colors = usedColors({ ...canvasProject, objects: [createText({ color: '#FFD21F' })] })
    return colors.includes('#ffd21f')
  })())
}

// --------------------------------------------------- shorts / vertical format
console.log('shorts format')
{
  const { FORMATS, formatForSize, defaultSafeZone, safeZoneRects } = await import('../src/data/formats')
  const { normalizeProject } = await import('../src/engine/normalize')
  const { SHORTS_TEMPLATES } = await import('../src/data/shortsTemplates')
  const { templatesForFormat } = await import('../src/data/templates')
  const { analyzeDesign, contrastRatio, luminance } = await import('../src/engine/designAssistant')
  const { placementPatch, quickActionPatch, QUICK_ACTIONS } = await import('../src/engine/quickActions')
  const { autoSizePatch } = await import('../src/engine/text')
  const { DEFAULT_BACKGROUND } = await import('../src/types')

  const shorts = FORMATS.shorts
  check('shorts is 1080 × 1920', shorts.width === 1080 && shorts.height === 1920)
  check('shorts is 9:16', near(shorts.width / shorts.height, 9 / 16, 0.0001))
  check('portrait canvases classify as shorts', formatForSize(1080, 1920) === 'shorts')
  check('landscape canvases classify as thumbnails', formatForSize(1280, 720) === 'thumbnail')
  check('square canvases stay thumbnails', formatForSize(1000, 1000) === 'thumbnail')

  // Safe zone geometry: safe ⊂ warning ⊂ canvas, with the right insets.
  const zone = defaultSafeZone('shorts')
  const { safe, warning } = safeZoneRects(zone, 1080, 1920)
  check('warning rect honours the percentages', near(warning.x, 1080 * 0.04) && near(warning.y, 1920 * 0.09))
  check('warning rect leaves the action rail clear', near(warning.x + warning.width, 1080 * (1 - 0.13)))
  check('warning rect leaves the title row clear', near(warning.y + warning.height, 1920 * (1 - 0.2)))
  check(
    'safe rect sits inside the warning band',
    safe.x > warning.x && safe.y > warning.y && safe.x + safe.width < warning.x + warning.width && safe.y + safe.height < warning.y + warning.height,
  )
  check('a zero warning band collapses onto the warning rect', (() => {
    const flat = safeZoneRects({ ...zone, warning: 0 }, 1080, 1920)
    return near(flat.safe.x, flat.warning.x) && near(flat.safe.width, flat.warning.width)
  })())

  // Migration of projects saved before the format existed.
  const legacy = {
    id: 'old',
    name: 'Legacy',
    width: 1080,
    height: 1920,
    background: { ...DEFAULT_BACKGROUND },
    objects: [createText({ text: 'hi' })],
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Project
  delete (legacy.objects[0] as Record<string, unknown>).autoFit
  const migrated = normalizeProject(legacy)
  check('legacy portrait projects become shorts', migrated.format === 'shorts')
  check('legacy projects gain a safe zone', migrated.safeZone.bottom === defaultSafeZone('shorts').bottom)
  check('legacy text layers gain auto-fit defaults', (migrated.objects[0] as { autoFit: string }).autoFit === 'off')

  // Templates are filtered by format and land on the right canvas.
  check('shorts templates are tagged', SHORTS_TEMPLATES.every((t) => t.format === 'shorts'))
  check('format filter separates the galleries', (() => {
    const vertical = templatesForFormat('shorts')
    const horizontal = templatesForFormat('thumbnail')
    return vertical.length === SHORTS_TEMPLATES.length && horizontal.every((t) => (t.format ?? 'thumbnail') === 'thumbnail')
  })())

  const shortsProject = (objects: SceneObject[]): Project => ({
    id: 's',
    name: 'Short',
    format: 'shorts',
    width: 1080,
    height: 1920,
    safeZone: defaultSafeZone('shorts'),
    background: { ...DEFAULT_BACKGROUND },
    objects,
    createdAt: 0,
    updatedAt: 0,
  })

  // Every vertical layout must keep its content out of YouTube's chrome.
  for (const template of SHORTS_TEMPLATES) {
    const built = template.build(1080, 1920)
    const project = { ...shortsProject(built.objects), background: built.background }
    const report = analyzeDesign(project)
    const failed = report.checks.filter((c) => c.status === 'fail')
    check(
      `shorts template "${template.name}" has no failing checks`,
      failed.length === 0,
      failed.map((f) => `${f.id}: ${f.detail}`).join(' | '),
    )
    const inCanvas = built.objects.every((o) => o.x >= -2 && o.y >= -2 && o.x + o.width <= 1082 && o.y + o.height <= 1922)
    check(`shorts template "${template.name}" stays on canvas`, inCanvas)
  }

  // The assistant has to catch real problems, not just agree.
  const buried = shortsProject([createText({ text: 'READ ME', fontSize: 120, x: 60, y: 1820, width: 900, height: 90 })])
  const buriedReport = analyzeDesign(buried)
  check('assistant flags text under the title row', buriedReport.checks.find((c) => c.id === 'safe-area')?.status === 'fail')
  check('assistant flags text near the bottom', buriedReport.checks.find((c) => c.id === 'bottom')?.status === 'warn')

  const tiny = shortsProject([createText({ text: 'small', fontSize: 30, x: 200, y: 900, width: 600, height: 60 })])
  check('assistant flags unreadable text', analyzeDesign(tiny).checks.find((c) => c.id === 'headline')?.status !== 'pass')

  const wordy = shortsProject([
    createText({ text: 'one two three four five six seven eight nine ten eleven twelve', fontSize: 120, x: 90, y: 600, width: 800, height: 400 }),
  ])
  check('assistant flags too much copy', analyzeDesign(wordy).checks.find((c) => c.id === 'words')?.status === 'warn')

  const clean = shortsProject([createText({ text: 'BIG HOOK', fontSize: 150, x: 120, y: 500, width: 800, height: 200, color: '#FFFFFF' })])
  const cleanReport = analyzeDesign(clean)
  check('a tidy composition scores well', cleanReport.score >= 80, `score ${cleanReport.score}`)
  check('scores stay within 0–100', cleanReport.score <= 100 && buriedReport.score >= 0)

  // Contrast maths.
  const white = luminance('#FFFFFF')!
  const black = luminance('#000000')!
  check('white on black is 21:1', near(contrastRatio(white, black), 21, 0.1))
  const lowContrast = {
    ...shortsProject([
      createText({ text: 'HELLO', fontSize: 150, x: 120, y: 500, width: 800, height: 200, color: '#111111', strokeWidth: 0 }),
    ]),
    background: { ...DEFAULT_BACKGROUND, kind: 'solid' as const, color: '#222222' },
  }
  check('assistant flags low contrast', analyzeDesign(lowContrast).checks.find((c) => c.id === 'contrast')?.status === 'fail')
  const stroked = {
    ...lowContrast,
    objects: [createText({ text: 'HELLO', fontSize: 150, x: 120, y: 500, width: 800, height: 200, color: '#111111', strokeWidth: 8 })],
  }
  check('a stroke rescues low contrast', analyzeDesign(stroked).checks.find((c) => c.id === 'contrast')?.status === 'pass')

  // Quick actions.
  const photo = createImage('a', 1000, 1500, 1080, 1920, { name: 'Subject' })
  const popped = { ...photo, ...quickActionPatch('pop', photo) }
  check('make pop lifts contrast and outlines the subject', popped.adjustments.contrast > photo.adjustments.contrast && popped.effects.outline.enabled)
  const maxed = { ...photo, adjustments: { ...photo.adjustments, contrast: 95 } }
  check('quick actions clamp at the slider limit', ({ ...maxed, ...quickActionPatch('contrast', maxed) }).adjustments.contrast === 100)
  const reset = { ...popped, ...quickActionPatch('reset', popped) }
  check('reset clears adjustments and effects', reset.adjustments.contrast === 0 && !reset.effects.outline.enabled)
  check('every quick action produces a patch', QUICK_ACTIONS.every((a) => Object.keys(quickActionPatch(a.id, photo)).length > 0))

  // Subject placement.
  const canvas = shortsProject([])
  for (const placement of ['left', 'center', 'right', 'top', 'bottom'] as const) {
    const patch = placementPatch(placement, photo, canvas)
    const placed = { ...photo, ...patch }
    check(
      `place ${placement} keeps the subject on canvas`,
      placed.x >= 0 && placed.y >= 0 && placed.x + placed.width <= canvas.width + 1,
      JSON.stringify(patch),
    )
    check(`place ${placement} keeps the aspect ratio`, near(placed.width / placed.height, photo.width / photo.height, 0.02))
  }
  const filled = { ...photo, ...placementPatch('fill', photo, canvas) }
  check('fill covers the canvas', filled.width >= canvas.width && filled.height >= canvas.height)
  const centred = { ...photo, ...placementPatch('center', photo, canvas) }
  check('vertical subjects are anchored above the title row', centred.y + centred.height < canvas.height)

  // Auto fit (headless path: estimates from the longest line).
  const long = createText({ text: 'LEARN JAVASCRIPT IN 30 DAYS', width: 900, height: 300, fontSize: 200, autoFit: 'width', noWrap: true })
  const fitted = autoSizePatch(long).fontSize!
  check('auto fit shrinks oversized text', fitted < 200)
  const narrow = autoSizePatch({ ...long, width: 400 }).fontSize!
  check('a narrower box fits smaller text', narrow < fitted)
  const boxFit = autoSizePatch({ ...long, autoFit: 'box', height: 80 }).fontSize!
  check('fit box also respects the height', boxFit <= fitted)
  check('auto fit off leaves the size alone', autoSizePatch({ ...long, autoFit: 'off', autoHeight: false }).fontSize === undefined)
}

// ---------------------------------------------------------- brand: Brand 1 ---
console.log('brand preset: super learner')
{
  const { SUPER_LEARNER, LAYOUT } = await import('../src/data/superLearner')
  const { SUPER_LEARNER_TEMPLATES } = await import('../src/data/superLearnerTemplates')
  const { BRAND_PRESETS, brandPreset, DEFAULT_BRAND_ID } = await import('../src/data/brands')
  const { templatesForBrand, TEMPLATES } = await import('../src/data/templates')
  const { runBrandQa, nearestRole, hexToRgb, shareFromPixels } = await import('../src/engine/brandQa')
  const { brandIconSlot, brandTextObject, cutoutPatch } = await import('../src/engine/brandApply')
  const { DEFAULT_BACKGROUND } = await import('../src/types')

  // The palette, verbatim from the style guide.
  const guide: Record<string, string> = {
    ink: '#181A1F',
    light: '#F5F5F0',
    yellow: '#FFD43B',
    blue: '#4DA3FF',
    red: '#FF4D4D',
    muted: '#9CA3AF',
  }
  check(
    'palette matches the style guide',
    Object.entries(guide).every(([role, hex]) => SUPER_LEARNER.palette.find((c) => c.role === role)?.hex === hex),
    SUPER_LEARNER.palette.map((c) => `${c.role}=${c.hex}`).join(' '),
  )
  check('the guide uses Anton for headlines and Inter for support', SUPER_LEARNER.fonts.headline === 'Anton' && SUPER_LEARNER.fonts.supporting === 'Inter')
  check('canvas is 1280 × 720', SUPER_LEARNER.canvas.width === 1280 && SUPER_LEARNER.canvas.height === 720)
  check('layout is the 60 / 40 split', near(LAYOUT.textShare, 0.6) && near(LAYOUT.subjectShare, 0.4))
  check('the subject belongs on the right', SUPER_LEARNER.rules.subject?.side === 'right')
  check('exactly one keyword may be highlighted', JSON.stringify(SUPER_LEARNER.rules.highlights) === '[1,1]')
  check('the brand does not outline its subject', SUPER_LEARNER.cutout.requireOutline === false)
  check('there is a slot for the one flat icon', !!SUPER_LEARNER.iconSlot)
  check('the free icon licence is surfaced', /flaticon/i.test(SUPER_LEARNER.attribution ?? ''))

  check('every text style sits inside its declared band', (() => {
    return SUPER_LEARNER.textStyles.every((s) => {
      const size = s.apply.fontSize ?? 0
      return size >= s.range[0] && size <= s.range[1]
    })
  })())
  check('only the keyword style carries a highlight plate', SUPER_LEARNER.textStyles.filter((s) => s.apply.bgEnabled).length === 1)
  check('the keyword plate uses the accent yellow', SUPER_LEARNER.textStyles.find((s) => s.id === 'keyword')?.apply.bgColor === guide.yellow)
  check('no style uses a glow', SUPER_LEARNER.textStyles.every((s) => !s.apply.effects?.glow.enabled))

  check('the preset is registered', BRAND_PRESETS.some((b) => b.id === 'super-learner'))
  check('an unknown brand id falls back', brandPreset('nope').id === BRAND_PRESETS[0].id)
  check('new projects default to a real brand', BRAND_PRESETS.some((b) => b.id === DEFAULT_BRAND_ID))
  check('templates are reachable by brand', templatesForBrand('super-learner').length === SUPER_LEARNER_TEMPLATES.length)
  check('brands do not share templates', templatesForBrand('super-learner').every((t) => !templatesForBrand('ranjan-notes').includes(t)))
  check('every gallery template keeps its category', TEMPLATES.every((t) => typeof t.category === 'string'))

  // Colour buckets must be distinguishable within this palette.
  const collisions = SUPER_LEARNER.palette.filter((c) => nearestRole(hexToRgb(c.hex)!, SUPER_LEARNER) !== c.role)
  check('each brand colour maps to its own role', collisions.length === 0, collisions.map((c) => c.name).join(', '))
  check('an off-brand colour is rejected', nearestRole(hexToRgb('#8B5CF6')!, SUPER_LEARNER) === null)

  const project = (objects: SceneObject[], background = DEFAULT_BACKGROUND): Project => ({
    id: 'sl',
    name: 'Brand 1',
    format: 'thumbnail',
    brandId: 'super-learner',
    width: 1280,
    height: 720,
    safeZone: { top: 4, bottom: 11, left: 3, right: 3, warning: 3 },
    background: { ...background },
    objects,
    createdAt: 0,
    updatedAt: 0,
  })

  // Every layout must satisfy the guide it was built from.
  for (const template of SUPER_LEARNER_TEMPLATES) {
    const built = template.build(1280, 720)
    const items = runBrandQa(project(built.objects, built.background), null, SUPER_LEARNER)
    const failed = items.filter((i) => i.status === 'fail' || i.status === 'warn')
    check(
      `layout "${template.name}" passes brand QA`,
      failed.length === 0,
      failed.map((f) => `${f.id}: ${f.detail}`).join(' | '),
    )
    const texts = built.objects.filter((o) => o.type === 'text')
    check(
      `layout "${template.name}" highlights exactly one keyword`,
      texts.filter((t) => t.type === 'text' && t.bgEnabled).length === 1,
    )
    // Headline-level copy stays in the column; small asides (the sticky note in
    // the reference art) are allowed to overlap the creator, as the guide does.
    check(
      `layout "${template.name}" keeps the main copy in the left 60%`,
      texts.every((t) => t.type !== 'text' || t.fontSize < 55 || t.x + t.width <= 1280 * LAYOUT.textShare),
    )
    check(`layout "${template.name}" includes the icon slot`, built.objects.some((o) => o.name.includes('Flat icon')))
  }

  // The rules have to bite, not just agree.
  const twoHighlights = project([
    createText({ text: 'ONE TWO', fontSize: 132, x: 56, y: 100, width: 600, height: 140, bgEnabled: true }),
    createText({ text: 'THREE', fontSize: 132, x: 56, y: 260, width: 600, height: 140, bgEnabled: true }),
  ])
  const status = (items: ReturnType<typeof runBrandQa>, id: string) => items.find((i) => i.id === id)?.status
  check('two highlighted keywords are flagged', status(runBrandQa(twoHighlights, null, SUPER_LEARNER), 'highlight') === 'warn')
  check(
    'no highlight at all is flagged',
    status(runBrandQa(project([createText({ text: 'PLAIN HOOK', fontSize: 132, x: 56, y: 100, width: 600, height: 140 })]), null, SUPER_LEARNER), 'highlight') === 'warn',
  )

  const subjectOnLeft = project([
    createText({ text: 'GOOD HOOK', fontSize: 132, x: 56, y: 100, width: 600, height: 140, bgEnabled: true }),
    createImage('photo', 400, 600, 1280, 720, { name: 'Creator cut-out', x: 60, y: 90, width: 360, height: 560 }),
  ])
  check('a subject on the wrong side is flagged', status(runBrandQa(subjectOnLeft, null, SUPER_LEARNER), 'layout') === 'warn')
  const copyInSubjectZone = project([
    createText({ text: 'GOOD HOOK', fontSize: 132, x: 900, y: 100, width: 320, height: 140, bgEnabled: true }),
  ])
  check('copy inside the subject zone is flagged', status(runBrandQa(copyInSubjectZone, null, SUPER_LEARNER), 'layout') === 'warn')
  check(
    'a full-bleed photo is treated as a background, not the subject',
    status(
      runBrandQa(
        project([
          createText({ text: 'GOOD HOOK', fontSize: 132, x: 56, y: 100, width: 600, height: 140, bgEnabled: true }),
          createImage('bg', 1280, 720, 1280, 720, { name: 'Backdrop', x: 0, y: 0, width: 1280, height: 720 }),
        ]),
        null,
        SUPER_LEARNER,
      ),
      'layout',
    ) === 'pass',
  )

  // This brand is dark-dominant — the inverse of the Ranjan budget.
  const pixels = new Uint8ClampedArray(100 * 4)
  const mix: [number, [number, number, number]][] = [
    [50, [24, 26, 31]], // ink
    [14, [245, 245, 240]], // light
    [9, [255, 212, 59]], // yellow
    [4, [77, 163, 255]], // blue
    [23, [150, 110, 90]], // skin tones — off palette by design
  ]
  let at = 0
  for (const [count, [r, g, b]] of mix) {
    for (let i = 0; i < count; i++, at++) {
      pixels[at * 4] = r
      pixels[at * 4 + 1] = g
      pixels[at * 4 + 2] = b
      pixels[at * 4 + 3] = 255
    }
  }
  const share = shareFromPixels(pixels, SUPER_LEARNER)
  check('ink is measured as the ground', near(share.ink, 50, 0.5))
  check('a photo lands outside the palette', near(share.other, 23, 0.5))
  const graded = runBrandQa(
    project([createText({ text: 'GOOD HOOK', fontSize: 132, x: 56, y: 100, width: 600, height: 140, bgEnabled: true })]),
    share,
    SUPER_LEARNER,
  )
  check('the ink ground is within budget', status(graded, 'ground') === 'pass')
  check('yellow is within budget', status(graded, 'budget:yellow') === 'pass')
  const allYellow = runBrandQa(project([]), { ...share, yellow: 40, ink: 20 }, SUPER_LEARNER)
  check('a yellow flood is flagged', status(allYellow, 'budget:yellow') === 'warn')
  check('losing the ink ground is flagged', status(allYellow, 'ground') === 'warn')

  // Apply helpers respect the preset they are handed.
  const blank = project([])
  const hook = brandTextObject(SUPER_LEARNER, 'hook', blank)
  check('a brand headline uses the brand font', hook.fontFamily === 'Anton' && hook.color === guide.light)
  check('a brand headline stays in the copy column', hook.x + hook.width <= 1280 * LAYOUT.textShare + 1)
  const icon = brandIconSlot(SUPER_LEARNER, blank)!
  check('the icon slot is square and empty', icon.width === icon.height && icon.assetId === '')
  const patch = cutoutPatch(SUPER_LEARNER)
  check('the cut-out treatment has no outline', patch.effects?.outline.enabled === false)
  check('the cut-out treatment grades the photo', patch.adjustments?.contrast === 8 && patch.adjustments?.sharpness === 6)
}

// ---------------------------------------------------------- preview surfaces
{
  console.log('preview surfaces')
  const { FORMATS } = await import('../src/data/formats')
  const { surfacesFor, groupedSurfaces, smallestSurface } = await import('../src/data/previewSurfaces')
  const LAYOUTS = ['grid', 'row', 'feature', 'bare', 'immersive', 'tv']
  for (const format of ['thumbnail', 'shorts'] as const) {
    const surfaces = surfacesFor(format)
    const config = FORMATS[format]
    check(`${format}: surfaces are defined`, surfaces.length >= 5, String(surfaces.length))
    check(`${format}: ids are unique`, new Set(surfaces.map((s) => s.id)).size === surfaces.length)
    check(`${format}: every layout is one the dialog renders`, surfaces.every((s) => LAYOUTS.includes(s.layout)))
    // A preview that upscales is a lie about how the design will be seen.
    check(
      `${format}: no surface is wider than the canvas`,
      surfaces.every((s) => s.width <= config.width),
      String(Math.max(...surfaces.map((s) => s.width))),
    )
    check(
      `${format}: the smallest surface is the smallest`,
      smallestSurface(format).width === Math.min(...surfaces.map((s) => s.width)),
    )

    const groups = groupedSurfaces(format)
    check(`${format}: grouping loses nothing`, groups.reduce((n, g) => n + g.surfaces.length, 0) === surfaces.length)
    check(`${format}: group names are unique`, new Set(groups.map((g) => g.group)).size === groups.length)
    check(
      `${format}: each group keeps its source order`,
      groups.every((g) => g.surfaces.every((s) => s.group === g.group)),
    )
  }
  // The Shorts player is the only surface that draws app chrome over the art.
  check(
    'only Shorts has an immersive surface',
    surfacesFor('shorts').some((s) => s.layout === 'immersive') &&
      !surfacesFor('thumbnail').some((s) => s.layout === 'immersive'),
  )
  check('a thumbnail is previewed down to 100 px or less', smallestSurface('thumbnail').width <= 100)
}

// ------------------------------------------------------------ feather mask
{
  console.log('feather mask')
  const { maskPadding, maskInset } = await import('../src/engine/renderer')
  const { DEFAULT_MASK } = await import('../src/types')
  const { normalizeProject } = await import('../src/engine/normalize')

  check('a new layer has no mask', createText().mask.enabled === false)
  check('a new shape carries the mask defaults', createShape('rect').mask.feather === DEFAULT_MASK.feather)
  check('masks are not shared between layers', createText().mask !== createText().mask)

  const off = { ...DEFAULT_MASK, enabled: false, shape: 'subject' as const, feather: 40 }
  check('a disabled mask needs no room', maskPadding(off) === 0)
  // A drawn region is clamped inside the box, so only a subject mask spreads.
  check('a drawn mask needs no room', maskPadding({ ...off, enabled: true, shape: 'rect' }) === 0)
  check('an ellipse mask needs no room', maskPadding({ ...off, enabled: true, shape: 'ellipse' }) === 0)
  check('a subject mask reserves half its feather', maskPadding({ ...off, enabled: true }) === 22, String(maskPadding({ ...off, enabled: true })))
  check('expansion adds to the reservation', maskPadding({ ...off, enabled: true, expand: 10 }) === 32)
  check('a choke does not shrink the reservation', maskPadding({ ...off, enabled: true, expand: -10 }) === 22)

  // The falloff has to land on the layer: half the feather, pushed back by expand.
  check('the falloff sits inside the box', maskInset({ ...DEFAULT_MASK, feather: 40 }) === 20)
  check('expansion pushes the mask out', maskInset({ ...DEFAULT_MASK, feather: 40, expand: 12 }) === 8)
  check('the mask never leaves the box', maskInset({ ...DEFAULT_MASK, feather: 40, expand: 100 }) === 0)
  check('a choke pulls the mask in', maskInset({ ...DEFAULT_MASK, feather: 0, expand: -15 }) === 15)
  check('no feather is no inset', maskInset(DEFAULT_MASK) === maskInset({ ...DEFAULT_MASK, feather: 0 }) + 20)

  // Projects saved before feather existed must still open.
  const { DEFAULT_BACKGROUND } = await import('../src/types')
  const { defaultSafeZone: zone } = await import('../src/data/formats')
  const stored = {
    id: 'legacy',
    name: 'Legacy',
    format: 'thumbnail' as const,
    brandId: null,
    width: 1280,
    height: 720,
    safeZone: zone('thumbnail'),
    background: DEFAULT_BACKGROUND,
    objects: [createText({ id: 'legacy-text' })],
    createdAt: 0,
    updatedAt: 0,
  }
  delete (stored.objects[0] as { mask?: unknown }).mask
  const migrated = normalizeProject(stored)
  check('an older project gains the mask defaults', migrated.objects[0].mask.enabled === false && migrated.objects[0].mask.shape === 'rect')
}

// ---------------------------------------------------------- thumbnail score
{
  console.log('thumbnail score')
  const { METRIC_INFO, PLATFORM_INFO, verdict, weakest, textRegions, occlusionRects } = await import(
    '../src/engine/thumbnailScore'
  )
  const { DEFAULT_BACKGROUND } = await import('../src/types')
  const { defaultSafeZone: zoneFor, FORMATS: F } = await import('../src/data/formats')

  const scene = (objects: SceneObject[], format: 'thumbnail' | 'shorts' = 'thumbnail'): Project => ({
    id: 's',
    name: 'Scored',
    format,
    brandId: null,
    width: F[format].width,
    height: F[format].height,
    safeZone: zoneFor(format),
    background: DEFAULT_BACKGROUND,
    objects,
    createdAt: 0,
    updatedAt: 0,
  })

  check('verdicts split at the documented thresholds', verdict(75) === 'good' && verdict(74) === 'fair' && verdict(50) === 'fair' && verdict(49) === 'poor')
  check('every metric the scorer reports has advice', ['text', 'detail', 'focus', 'palette', 'range', 'sharpness', 'occlusion'].every((id) => METRIC_INFO[id as 'text'] && METRIC_INFO[id as 'text'].fix.length > 20))
  check('both platforms have copy', !!PLATFORM_INFO.desktop && !!PLATFORM_INFO.mobile)

  // Text regions: normalised, rotation-aware, and only real text.
  const headline = createText({ x: 128, y: 72, width: 640, height: 144, text: 'HOOK' })
  const empty = createText({ x: 0, y: 0, width: 100, height: 100, text: '   ' })
  const hidden = { ...createText({ text: 'GONE' }), hidden: true }
  const regions = textRegions(scene([headline, empty, hidden, createImage('a', 100, 100)]))
  check('only visible, non-empty text is measured', regions.length === 1, String(regions.length))
  check('regions are normalised', regions[0][0] === 0.1 && regions[0][1] === 0.1 && regions[0][2] === 0.5)
  check('regions stay inside 0..1', regions.every((r) => r.every((v) => v >= 0 && v <= 1)))
  // A 45 degree tilt makes a wide, short box narrower in x and far taller, so
  // area — not width — is what must grow.
  const tilted = textRegions(scene([{ ...headline, rotation: 45 }]))
  check('a rotated headline reports the area it covers', tilted[0][2] * tilted[0][3] > regions[0][2] * regions[0][3] * 2)
  const offCanvas = textRegions(scene([createText({ x: -400, y: -100, width: 640, height: 144, text: 'EDGE' })]))
  check('a layer hanging off the canvas is clamped to it', offCanvas[0][0] === 0 && offCanvas[0][1] === 0 && offCanvas[0][2] < 0.2)
  check('a design with no text reports no regions', textRegions(scene([])).length === 0)

  // Occlusion comes from the project's own safe zone, not a second set of numbers.
  const rects = occlusionRects(scene([]))
  check('both platforms get interface rectangles', rects.desktop.length > 0 && rects.mobile.length > 0)
  check('the duration badge is always covered', rects.desktop.some((r) => r[0] > 0.7 && r[1] > 0.8))
  const shortsRects = occlusionRects(scene([], 'shorts'))
  // Shorts hands far more of the frame to the app's own controls.
  const area = (rs: number[][]) => rs.reduce((sum, r) => sum + r[2] * r[3], 0)
  check('Shorts reserves more of the frame than a thumbnail', area(shortsRects.mobile) > area(rects.mobile), `${area(shortsRects.mobile).toFixed(2)} vs ${area(rects.mobile).toFixed(2)}`)
  check('every rectangle is inside the frame', [...rects.desktop, ...shortsRects.mobile].every((r) => r[0] >= 0 && r[1] >= 0 && r[0] + r[2] <= 1.001 && r[1] + r[3] <= 1.001))

  const platform = {
    id: 'mobile' as const,
    width: 168,
    score: 60,
    focus: { x: 0.5, y: 0.5 },
    metrics: [
      { id: 'text' as const, score: null, value: null },
      { id: 'focus' as const, score: 80, value: 0.1 },
      { id: 'range' as const, score: 21, value: 0.3 },
    ],
  }
  check('the weakest scored metric is found', weakest(platform)?.id === 'range')
  check('an unscored metric is never the weak point', weakest({ ...platform, metrics: [platform.metrics[0]] }) === null)
}

// ------------------------------------------------------------- justin sung
{
  console.log('brand preset: Brand 3')
  const { runBrandQa } = await import('../src/engine/brandQa')
  const { JUSTIN_SUNG, CANVAS: JS_CANVAS, RED: JS_RED, LAYOUT: JS_LAYOUT } = await import('../src/data/justinSung')
  const { JUSTIN_SUNG_TEMPLATES } = await import('../src/data/justinSungTemplates')
  const { BRAND_PRESETS, brandPreset } = await import('../src/data/brands')
  const { DEFAULT_BACKGROUND: JS_BG } = await import('../src/types')
  const { defaultSafeZone: jsZone } = await import('../src/data/formats')

  check('the preset is in the registry', BRAND_PRESETS.some((b) => b.id === 'justin-sung'))
  check('it can be looked up by id', brandPreset('justin-sung').name === 'Brand 3')
  check('the headline is sentence case, not capitals', JUSTIN_SUNG.textStyles.every((s) => s.tier !== 'L1' || s.apply.uppercase === false))
  check('the brand does not ask for a cut-out', JUSTIN_SUNG.cutout.requireCutout === false)
  check('the palette is black, white and red', JUSTIN_SUNG.palette.map((c) => c.role).join(',') === 'black,white,red,grey')
  check('every element style is on palette', JUSTIN_SUNG.elementStyles.every((e) => ['#000000', JS_RED].includes(e.apply.fill ?? '')))
  check('the scrims actually fade', JUSTIN_SUNG.elementStyles.filter((e) => e.id.startsWith('shadow')).every((e) => e.apply.fade?.enabled === true))
  check('there are scrims for both sides and an angle', ['shadow-left', 'shadow-bottom', 'shadow-wedge'].every((id) => JUSTIN_SUNG.elementStyles.some((e) => e.id === id)))

  const jsProject = (objects: SceneObject[], background = JS_BG): Project => ({
    id: 'js',
    name: 'Brand 3',
    format: 'thumbnail',
    brandId: 'justin-sung',
    width: JS_CANVAS.width,
    height: JS_CANVAS.height,
    safeZone: jsZone('thumbnail'),
    background,
    objects,
    createdAt: 0,
    updatedAt: 0,
  })

  check('there are layouts for the brand', JUSTIN_SUNG_TEMPLATES.length >= 4)
  for (const template of JUSTIN_SUNG_TEMPLATES) {
    const built = template.build(JS_CANVAS.width, JS_CANVAS.height)
    const items = runBrandQa(jsProject(built.objects, built.background), null, JUSTIN_SUNG)
    const failed = items.filter((i) => i.status === 'fail' || i.status === 'warn')
    check(
      `layout "${template.name}" passes brand QA`,
      failed.length === 0,
      failed.map((f) => `${f.id}: ${f.detail}`).join(' | '),
    )

    const objects = built.objects
    const photos = objects.filter((o) => o.type === 'image')
    check(`layout "${template.name}" frames the photo full bleed`, photos.length === 1 && photos[0].width === JS_CANVAS.width && photos[0].height === JS_CANVAS.height)
    // The photo has to be the bottom layer or the scrim would darken nothing.
    check(`layout "${template.name}" puts the photo underneath`, objects[0].type === 'image')
    const scrims = objects.filter((o) => o.type === 'shape' && o.fade.enabled)
    check(`layout "${template.name}" has exactly one black shadow`, scrims.length === 1, String(scrims.length))
    check(`layout "${template.name}" darkens with black`, scrims.every((s) => s.type === 'shape' && s.fill === '#000000'))
    // One red mark: either the bar or the plate, never both.
    const bars = objects.filter((o) => o.type === 'shape' && o.fill === JS_RED).length
    const plates = objects.filter((o) => o.type === 'text' && o.bgEnabled).length
    check(`layout "${template.name}" carries exactly one red mark`, bars + plates === 1, `${bars} bars + ${plates} plates`)
    const headlines = objects.filter((o) => o.type === 'text' && o.fontSize >= 120)
    check(`layout "${template.name}" sets the headline in sentence case`, headlines.every((t) => t.type === 'text' && t.uppercase === false))
    check(`layout "${template.name}" keeps copy out of the subject half`, headlines.every((t) => t.x < JS_CANVAS.width * JS_LAYOUT.textShare))
  }

  // The rules must bite, not just say yes.
  const capsHook = JUSTIN_SUNG.textStyles.find((s) => s.id === 'hook')!
  const shouty = jsProject([createText({ ...capsHook.apply, text: 'This headline is far too long to work', x: 48, y: 200, width: 1000, height: 300 })])
  const shoutyItems = runBrandQa(shouty, null, JUSTIN_SUNG)
  check('a seven-word headline is flagged', shoutyItems.find((i) => i.id === 'title-words')?.status !== 'pass')
  const full = jsProject([createImage('photo-1', 1280, 720, 1280, 720, { x: 0, y: 0, width: 1280, height: 720 })])
  check(
    'a full-bleed photo is not asked to be cut out',
    runBrandQa(full, null, JUSTIN_SUNG).find((i) => i.id === 'cutout')?.status === 'pass',
  )
  check(
    'another brand still asks for the cut-out',
    runBrandQa(full, null, brandPreset('super-learner')).find((i) => i.id === 'cutout')?.status === 'warn',
  )
}

// ------------------------------------------------------------- shape fade
{
  console.log('shape fade')
  const { fadeStops } = await import('../src/engine/renderer')
  const { DEFAULT_FADE } = await import('../src/types')
  const { ELEMENTS: ALL_ELEMENTS } = await import('../src/data/elements')
  const { createElement } = await import('../src/engine/factory')
  const { JUSTIN_SUNG } = await import('../src/data/justinSung')

  check('a new shape does not fade', createShape('rect').fade.enabled === false)
  const [fadeA, fadeB] = fadeStops({ softness: 60, midpoint: 50 })
  check('the transition is centred on the midpoint', near(fadeA, 0.2) && near(fadeB, 0.8), `${fadeA} ${fadeB}`)
  check('softness widens it', fadeStops({ softness: 100, midpoint: 50 })[0] === 0)
  // Two stops at one offset is a degenerate gradient, so a hard edge is the
  // smallest step the canvas can express.
  const hard = fadeStops({ softness: 0, midpoint: 50 })
  check('a hard edge still has two distinct stops', hard[1] > hard[0], hard.join(' '))
  check('stops never leave 0..1', [fadeStops({ softness: 100, midpoint: 0 }), fadeStops({ softness: 100, midpoint: 100 })].every(([lo, hi]) => lo >= 0 && hi <= 1))
  check('the midpoint moves the transition', fadeStops({ softness: 20, midpoint: 20 })[0] < fadeStops({ softness: 20, midpoint: 80 })[0])

  const shadows = ALL_ELEMENTS.filter((e) => e.category === 'Shadows')
  check('the element library offers shadows', shadows.length >= 5, String(shadows.length))
  check('every shadow fades', shadows.every((e) => e.fade?.enabled === true))
  check('every shadow is black', shadows.every((e) => e.defaultFill === '#000000'))
  // A scrim is only useful covering the frame it darkens.
  const inserted = createElement(shadows[0], 1280, 720)
  check('a shadow is inserted full bleed', inserted.x === 0 && inserted.y === 0 && inserted.width === 1280 && inserted.height === 720)
  check('an ordinary element is not', createElement(ALL_ELEMENTS[0], 1280, 720).width < 1280)
  check('the inserted shadow carries its fade', inserted.fade.enabled && inserted.fade.from === shadows[0].fade!.from)
  check('defaults are not shared between shapes', createShape('rect').fade !== DEFAULT_FADE)

  // The angle, read like a protractor ------------------------------------
  const { fadeVector } = await import('../src/engine/renderer')
  check('a new shadow is square to its edge', DEFAULT_FADE.angle === 90)

  // 90 degrees has to come out as the plain axis-aligned direction, or every
  // design made before the angle existed would shift the day it arrived.
  const square = { left: [1, 0], right: [-1, 0], top: [0, 1], bottom: [0, -1] } as const
  for (const [from, [x, y]] of Object.entries(square)) {
    const v = fadeVector(from as 'left', 90)
    check(`90 degrees from the ${from} is unchanged`, near(v.x, x) && near(v.y, y), `${v.x} ${v.y}`)
  }

  const lean = fadeVector('left', 45)
  check('45 degrees is a true diagonal', near(lean.x, lean.y) && near(lean.x, Math.SQRT1_2))
  check('the vector stays a unit vector', [10, 30, 52, 90].every((a) => near(Math.hypot(fadeVector('left', a).x, fadeVector('left', a).y), 1)))
  // Leaning further must not flip the direction the shadow comes from.
  check('a leaning left shadow still comes from the left', [10, 30, 60, 90].every((a) => fadeVector('left', a).x > 0))
  check('a leaning right shadow still comes from the right', [10, 30, 60, 90].every((a) => fadeVector('right', a).x < 0))
  check('a leaning top shadow still comes from the top', [10, 30, 60, 90].every((a) => fadeVector('top', a).y > 0))
  check('a leaning bottom shadow still comes from the bottom', [10, 30, 60, 90].every((a) => fadeVector('bottom', a).y < 0))
  // Left and right are mirror images, which is what makes the control feel the
  // same whichever side you put the copy on.
  check('left and right lean the same way', near(fadeVector('left', 40).y, fadeVector('right', 40).y))
  check('the lean grows as the angle falls', fadeVector('left', 30).y > fadeVector('left', 70).y)
  check('out-of-range angles are clamped, not wrapped', near(fadeVector('left', 0).x, fadeVector('left', 1).x) && near(fadeVector('left', 200).x, fadeVector('left', 90).x))

  // The brand's wedge is the angle now, not an oversized rotated rectangle.
  const wedge = JUSTIN_SUNG.elementStyles.find((e) => e.id === 'shadow-wedge')!
  check('the angled shadow leans through its fade', (wedge.apply.fade?.angle ?? 90) < 90)
  check('the angled shadow does not rotate the layer', (wedge.apply.rotation ?? 0) === 0)
  check('the angled shadow covers the canvas exactly', wedge.size[0] === 1 && wedge.size[1] === 1)
}

// ------------------------------------------------------------ object mask
{
  console.log('object mask')
  const { blurSigma, focusIsVisible, focusInverts, DEFAULT_FOCUS, FOCUS_TARGETS } = await import(
    '../src/engine/objectMask'
  )

  check('a fresh blur is off at zero', blurSigma(0, 1280) === 0)
  check('strength raises the radius', blurSigma(80, 1280) > blurSigma(30, 1280))
  // The same strength has to mean the same *look*, and a radius in pixels does
  // not: 24 px is a heavy blur on a phone still and nothing at all on a 4K one.
  check('the radius follows the image size', blurSigma(50, 3840) > blurSigma(50, 1280) * 2.5)
  check('full strength is a heavy blur, not an unusable one', near(blurSigma(100, 1280), 51.2, 0.01))
  check('strength is clamped, not wrapped', blurSigma(400, 1280) === blurSigma(100, 1280) && blurSigma(-20, 1280) === 0)

  // Below half a pixel there is nothing to see, so there is nothing worth
  // starting a 15 MB runtime for.
  check('an invisible blur is not worth running', !focusIsVisible({ ...DEFAULT_FOCUS, strength: 0 }, 1280))
  check('a real blur is', focusIsVisible(DEFAULT_FOCUS, 1280))
  check('a tiny blur on a small image is not', !focusIsVisible({ ...DEFAULT_FOCUS, strength: 1 }, 100))

  // The whole point of "blur behind": you scribble on the subject, and the
  // *other* side of the mask is what softens.
  check('blurring behind inverts the mask', focusInverts('background'))
  check('blurring the object does not', !focusInverts('object'))

  check('both targets are offered', FOCUS_TARGETS.map((t) => t.value).join(',') === 'background,object')
  check('every target says what it does', FOCUS_TARGETS.every((t) => t.label.length > 0 && t.hint.length > 12))
  check('the default target is one of them', FOCUS_TARGETS.some((t) => t.value === DEFAULT_FOCUS.target))
  check('the default strength is in range', DEFAULT_FOCUS.strength > 0 && DEFAULT_FOCUS.strength <= 100)
}

// ----------------------------------------------------------- fit to canvas
{
  console.log('fit to canvas')
  const { fitToCanvasPatch } = await import('../src/engine/quickActions')
  const { defaultSafeZone: fitZone } = await import('../src/data/formats')
  const { DEFAULT_BACKGROUND: FIT_BG } = await import('../src/types')

  const canvas: Project = {
    id: 'fit',
    name: 'fit',
    format: 'thumbnail',
    brandId: 'ranjan-notes',
    width: 1280,
    height: 720,
    safeZone: fitZone('thumbnail'),
    background: FIT_BG,
    objects: [],
    createdAt: 0,
    updatedAt: 0,
  }

  const photo = createImage('a', 1920, 1080, 1920, 1080, { x: 120, y: 90, width: 600, height: 338, rotation: 12 })
  const filled = fitToCanvasPatch(photo, canvas, 1920 / 1080)
  check('a photo lands on the canvas exactly', filled.x === 0 && filled.y === 0 && filled.width === 1280 && filled.height === 720)
  // A tilted layer cannot line up with the frame, so fitting has to level it.
  check('fitting levels a rotated layer', filled.rotation === 0)
  check('a photo of the same shape is not cropped', near(filled.crop!.width, 1) && near(filled.crop!.height, 1))

  // The crop is what keeps a face from being stretched to the canvas's shape.
  const wide = fitToCanvasPatch(photo, canvas, 3)
  check('a wider photo is cropped at the sides', wide.crop!.width < 1 && near(wide.crop!.height, 1))
  check('and the crop stays centred', near(wide.crop!.x, (1 - wide.crop!.width) / 2))
  const tall = fitToCanvasPatch(photo, canvas, 0.5)
  check('a taller photo is cropped top and bottom', tall.crop!.height < 1 && near(tall.crop!.width, 1))
  check('a photo still fills the frame whatever its shape', [3, 0.5, 1, 16 / 9].every((a) => {
    const p = fitToCanvasPatch(photo, canvas, a)
    return p.width === 1280 && p.height === 720
  }))

  // Anything that is not a photograph is fitted *inside*: stretching type or a
  // shape to another aspect ratio is not what "fit" means.
  const box = createShape('rect', { x: 10, y: 10, width: 200, height: 200, rotation: 30 })
  const fitted = fitToCanvasPatch(box, canvas)
  check('a square shape keeps its shape', near(fitted.width / fitted.height, 1, 0.01), `${fitted.width}×${fitted.height}`)
  check('it grows until it touches an edge', fitted.height === 720)
  check('it is centred on the canvas', fitted.x === (1280 - fitted.width) / 2 && fitted.y === 0)
  check('it never spills off the canvas', fitted.width <= 1280 && fitted.height <= 720)
  check('it is levelled too', fitted.rotation === 0)

  const heading = createText({ text: 'Fit me', fontSize: 40, width: 400, height: 100, autoFit: 'off' })
  const grown = fitToCanvasPatch(heading, canvas)
  // Scaling the box without the type would leave the words small in a huge box.
  check('type scales with its box', grown.fontSize !== undefined && grown.fontSize > 40)
  check('the type scales by the same factor as the box', near(grown.fontSize! / 40, grown.width / 400, 0.02))
  const autoFitted = fitToCanvasPatch(createText({ text: 'Fit me', fontSize: 40, autoFit: 'box' }), canvas)
  check('auto-fit type is left to its own sizing', autoFitted.fontSize === undefined)
}

// ------------------------------------------------------------ icon library
{
  console.log('icon library')
  const { ICON_GROUPS, iconLeaf } = await import('../src/data/icons')
  const { ICON_PREFIXES, ICON_BATCH, buildSvg, cachedIcon, chunk, groupByPrefix, iconLabel, iconSetUrl, ingestIconSet, parseIconId, sanitizeBody, searchUrl } =
    await import('../src/engine/iconLibrary')
  const { createIcon, DEFAULT_ICON_COLOR, ICON_INSERT_SHARE } = await import('../src/engine/factory')
  const { normalizeProject } = await import('../src/engine/normalize')

  check('every category is there', ICON_GROUPS.map((g) => g.label).join(',') === 'Education,Study,Time,Productivity')
  const leaves = ICON_GROUPS.flatMap((g) => g.leaves)
  check('every entry is there', leaves.length === 24, String(leaves.length))
  check('ids are unique', new Set(leaves.map((l) => `${l.id}`)).size === leaves.length)
  // The label is the creator's word and the query is the icon set's; "Habit"
  // finds nothing, `calendar-check` finds the drawing.
  check('every entry carries a query', leaves.every((l) => l.query.length > 1 && !l.query.includes(' ')))
  check('an entry can be looked up', iconLeaf('study', 'brain')?.query === 'brain')
  check('a missing entry is null, not a crash', iconLeaf('study', 'nope') === null)

  check('an icon id parses', parseIconId('mdi:book-open')?.name === 'book-open')
  check('a bare name is not an id', parseIconId('book') === null)
  check('nor is one with a path in it', parseIconId('mdi:book/../secret') === null)
  check('the label is readable', iconLabel('mdi:book-open-page-variant') === 'Book open page variant')

  const search = new URL(searchUrl('brain'))
  check('search only asks the open sets', search.searchParams.get('prefixes') === ICON_PREFIXES.join(','))
  // The API rejects a limit below 32, so asking for fewer returns nothing.
  check('the search limit respects the API floor', Number(search.searchParams.get('limit')) >= 32)
  check('the query is escaped', new URL(searchUrl('book open')).searchParams.get('query') === 'book open')

  // One request per icon would be fifty requests to open a category, and the
  // API answers that with 429 — which is what a grid of broken tiles is.
  const set = new URL(iconSetUrl('mdi', ['clock', 'brain']))
  check('a whole set is asked for at once', set.pathname === '/mdi.json' && set.searchParams.get('icons') === 'clock,brain')
  const grouped = groupByPrefix(['mdi:clock', 'ph:clock-bold', 'mdi:brain', 'mdi:clock', 'rubbish'])
  check('ids are grouped into one request per set', grouped.size === 2 && grouped.get('mdi')!.join(',') === 'clock,brain')
  check('unaddressable ids are dropped, not requested', !grouped.has('rubbish'))
  check('a long list is batched', chunk(Array.from({ length: 150 }, (_, i) => `i${i}`)).every((c) => c.length <= ICON_BATCH))
  check('batching loses nothing', chunk(Array.from({ length: 150 }, (_, i) => i)).flat().length === 150)

  ingestIconSet('mdi', {
    width: 24,
    height: 24,
    icons: { clock: { body: '<path fill="currentColor" d="M1 1"/>' }, big: { body: '<path d="M0 0"/>', width: 48, height: 32 } },
    aliases: { 'clock-alias': { parent: 'clock' } },
  })
  check('an icon set is read into the cache', cachedIcon('mdi:clock')?.width === 24)
  check("an icon's own size wins over the set's grid", cachedIcon('mdi:big')?.width === 48 && cachedIcon('mdi:big')?.height === 32)
  check('an alias resolves to its parent', cachedIcon('mdi:clock-alias')?.body === cachedIcon('mdi:clock')?.body)
  check('an unknown icon is simply absent', cachedIcon('mdi:nothing-like-this') === null)

  // Icon bodies are third-party markup that ends up in the DOM. Scripts do not
  // run from innerHTML, but inline handlers do.
  check('inline handlers are stripped', !sanitizeBody('<path onload="steal()" d="M0 0"/>').includes('onload'))
  check('single-quoted handlers too', !sanitizeBody("<path onclick='x' d='M0 0'/>").includes('onclick'))
  check('unquoted handlers too', !sanitizeBody('<path onerror=x d="M0 0"/>').includes('onerror'))
  check('scripts are stripped', sanitizeBody('<script>evil()</script><path d="M0 0"/>') === '<path d="M0 0"/>')
  check('the drawing survives', sanitizeBody('<path fill="currentColor" d="M0 0"/>') === '<path fill="currentColor" d="M0 0"/>')

  const built = buildSvg({ body: '<path fill="currentColor"/>', width: 24, height: 24 }, '#FF0000', 512)
  check('the built SVG carries an intrinsic size', built.includes('width="512"') && built.includes('height="512"'))
  check('it keeps the original viewBox', built.includes('viewBox="0 0 24 24"'))
  // Without this the icon rasterises as an invisible black-on-black shape.
  check('the colour replaces currentColor', built.includes('#FF0000') && !built.includes('currentColor'))
  const oblong = buildSvg({ body: '<path/>', width: 48, height: 24 }, '#000', 512)
  check('a non-square icon keeps its proportions', oblong.includes('width="512"') && oblong.includes('height="256"'))

  const icon = createIcon('mdi:brain', 'asset-1', 1024, 1024, 1280, 720)
  check('an icon records where it came from', icon.icon === 'mdi:brain')
  check('it is named after the icon', icon.name === 'Brain')
  check('it lands at a usable size', icon.width === Math.round(1280 * ICON_INSERT_SHARE))
  check('a square icon stays square', icon.width === icon.height)
  check('it is centred', icon.x === Math.round((1280 - icon.width) / 2) && icon.y === Math.round((720 - icon.height) / 2))
  // The raster is black, so without the overlay the icon is invisible on a dark
  // canvas — the overlay is the colour, not a decoration.
  check('the colour overlay is on and opaque', icon.effects.overlay.enabled && icon.effects.overlay.opacity === 100)
  check('it starts in the default colour', icon.effects.overlay.color === DEFAULT_ICON_COLOR)
  check('a chosen colour is honoured', createIcon('mdi:brain', 'a', 10, 10, 1280, 720, '#FFD21F').effects.overlay.color === '#FFD21F')
  const wide = createIcon('mdi:brain', 'a', 200, 100, 1280, 720)
  check('a wide icon is not squashed', wide.height === Math.round(wide.width / 2))

  // A project saved before icons existed must still open.
  const { defaultSafeZone: iconZone } = await import('../src/data/formats')
  const { DEFAULT_BACKGROUND: ICON_BG } = await import('../src/types')
  const legacyImage = createImage('old', 100, 100, 1280, 720) as SceneObject & { icon?: string | null }
  delete legacyImage.icon
  const legacy: Project = {
    id: 'legacy',
    name: 'legacy',
    format: 'thumbnail',
    brandId: null,
    width: 1280,
    height: 720,
    safeZone: iconZone('thumbnail'),
    background: ICON_BG,
    objects: [legacyImage],
    createdAt: 0,
    updatedAt: 0,
  }
  const migrated = normalizeProject(legacy).objects[0] as SceneObject & { icon?: string | null }
  check('an older image layer gains the field', migrated.icon === null)
}

// ----------------------------------------------------- colour psychology ---
console.log('colour psychology')
{
  const cp = await import('../src/data/colorPsychology')

  check('every hue is listed', cp.COLOR_MEANINGS.length === 12, String(cp.COLOR_MEANINGS.length))
  check('ids are unique', new Set(cp.COLOR_MEANINGS.map((m) => m.id)).size === 12)
  check('names are unique', new Set(cp.COLOR_MEANINGS.map((m) => m.name)).size === 12)
  check('every hue is a six-digit hex', cp.COLOR_MEANINGS.every((m) => /^#[0-9a-f]{6}$/i.test(m.hex)))
  check(
    'every hue says something on all three axes',
    cp.COLOR_MEANINGS.every((m) => m.emotions.length > 0 && m.industries.length > 0 && m.usedTo.length > 0),
  )

  // Colour maths ------------------------------------------------------------
  check('a hex round-trips', cp.rgbToHex(...cp.hexToRgb('#2BB3E4')) === '#2bb3e4')
  check('a bad hex is black, not a crash', cp.rgbToHex(...cp.hexToRgb('nonsense')) === '#000000')
  check('mixing all the way up is white', cp.mixHex('#2BB3E4', 1) === '#ffffff')
  check('mixing all the way down is black', cp.mixHex('#2BB3E4', -1) === '#000000')
  check('white is fully luminous', near(cp.relativeLuminance('#ffffff'), 1))
  check('black has no luminance', near(cp.relativeLuminance('#000000'), 0))
  check('black on white is 21:1', near(cp.contrastRatio('#000000', '#ffffff'), 21, 0.01))
  check(
    'contrast does not care about order',
    near(cp.contrastRatio('#E11D28', '#ffffff'), cp.contrastRatio('#ffffff', '#E11D28')),
  )

  // A tint must be lighter than its hue and a shade darker, or the ramp drawn
  // beneath each swatch would read backwards.
  check(
    'every tint is lighter than its hue',
    cp.COLOR_MEANINGS.every((m) => cp.relativeLuminance(cp.tintOf(m.hex)) > cp.relativeLuminance(m.hex)),
  )
  check(
    'every shade is darker than its hue',
    cp.COLOR_MEANINGS.every((m) => cp.relativeLuminance(cp.shadeOf(m.hex)) < cp.relativeLuminance(m.hex)),
  )

  // Readability -------------------------------------------------------------
  // The badges are the one part of the page that is measurement rather than
  // convention, so they have to be right. A hue that reads on neither ground
  // would be advice no creator could act on.
  check(
    'every hue carries large text on at least one ground',
    cp.COLOR_MEANINGS.every((m) => cp.readsOnDark(m.hex) || cp.readsOnLight(m.hex)),
  )
  check('yellow reads on dark', cp.readsOnDark('#F7CB15'))
  check('yellow does not read on white', !cp.readsOnLight('#F7CB15'))
  check('royal blue reads on white', cp.readsOnLight('#1B3F94'))
  check('royal blue does not read on dark', !cp.readsOnDark('#1B3F94'))

  // Search ------------------------------------------------------------------
  check('an empty query is every hue', cp.searchColorMeanings('   ').length === 12)
  const finance = cp.searchColorMeanings('finance')
  check('an industry finds its hue', finance.length === 1 && finance[0].id === 'royal-blue')
  check('search ignores case', cp.searchColorMeanings('URGENCY').map((m) => m.id).join() === 'red')
  const trust = cp.searchColorMeanings('trust').map((m) => m.id)
  check('a feeling can find several hues', trust.includes('royal-blue') && trust.includes('sky-blue'))
  check('an unknown word finds nothing', cp.searchColorMeanings('zzzz').length === 0)
}

// ------------------------------------------------------------ brand: Vivian ---
console.log('brand preset: vivian')
{
  const { VIVIAN, LAYOUT, SHADOW_SPEC } = await import('../src/data/vivian')
  const { VIVIAN_TEMPLATES } = await import('../src/data/vivianTemplates')
  const { BRAND_PRESETS, brandPreset } = await import('../src/data/brands')
  const { templatesForBrand, TEMPLATE_CATEGORIES } = await import('../src/data/templates')
  const { runBrandQa, nearestRole, hexToRgb } = await import('../src/engine/brandQa')
  const { brandIconSlot, brandTextObject, cutoutPatch } = await import('../src/engine/brandApply')
  const { DEFAULT_BACKGROUND } = await import('../src/types')

  const spec: Record<string, string> = {
    ink: '#181A1F',
    light: '#F5F5F0',
    yellow: '#FFD43B',
    blue: '#4DA3FF',
    red: '#FF4D4D',
    muted: '#9CA3AF',
  }
  check(
    'palette matches the brief',
    Object.entries(spec).every(([role, hex]) => VIVIAN.palette.find((c) => c.role === role)?.hex === hex),
    VIVIAN.palette.map((c) => `${c.role}=${c.hex}`).join(' '),
  )
  check('the brand is named Vivian', VIVIAN.name === 'Vivian' && VIVIAN.id === 'vivian')
  check('headlines are Anton, support is Inter', VIVIAN.fonts.headline === 'Anton' && VIVIAN.fonts.supporting === 'Inter')
  check('there is no third font to drift to', VIVIAN.fonts.accent === undefined)
  check('canvas is 1280 x 720', VIVIAN.canvas.width === 1280 && VIVIAN.canvas.height === 720)
  check('layout is the 60 / 40 split', near(LAYOUT.textShare, 0.6) && near(LAYOUT.subjectShare, 0.4))
  check('the presenter is 30-35% of the width', LAYOUT.presenterShare >= 0.3 && LAYOUT.presenterShare <= 0.35)
  check('the presenter belongs on the right', VIVIAN.rules.subject?.side === 'right')
  check('the headline is 2-4 words', JSON.stringify(VIVIAN.rules.hookWords) === '[2,4]')
  check('exactly one keyword may be highlighted', JSON.stringify(VIVIAN.rules.highlights) === '[1,1]')
  check('there is a slot for the one flat icon', !!VIVIAN.iconSlot)
  check('the icon slot asks for an outline set', /tabler/i.test(VIVIAN.iconSlot!.label + (VIVIAN.attribution ?? '')))
  check('every background is charcoal-grounded', VIVIAN.backgrounds.every((b) => b.value.color === spec.ink))

  check(
    'every text style sits inside its declared band',
    VIVIAN.textStyles.every((s) => {
      const size = s.apply.fontSize ?? 0
      return size >= s.range[0] && size <= s.range[1]
    }),
  )
  check('only the keyword style carries a highlight plate', VIVIAN.textStyles.filter((s) => s.apply.bgEnabled).length === 1)
  check('the keyword plate uses the signature yellow', VIVIAN.textStyles.find((s) => s.id === 'keyword')?.apply.bgColor === spec.yellow)
  // The alert line must stay below the 55 px the QA engine calls "prominent",
  // or a warning would eat the headline's word budget.
  check('the alert tier stays under the prominent line', (VIVIAN.textStyles.find((s) => s.id === 'alert')?.range[1] ?? 99) < 55)

  // The effect envelope from the brief, held on every shadow the brand ships.
  const shadows = [
    ...VIVIAN.textStyles.map((s) => s.apply.effects?.shadow),
    ...VIVIAN.elementStyles.map((e) => e.apply.effects?.shadow),
    VIVIAN.cutout.effects.shadow,
  ].filter((s) => s?.enabled)
  check('the brand ships at least one shadow to check', shadows.length > 0)
  check(
    'every shadow sits inside the 25-40% / 4-8 px / 2-4 px envelope',
    shadows.every(
      (s) =>
        s!.opacity >= SHADOW_SPEC.opacity[0] &&
        s!.opacity <= SHADOW_SPEC.opacity[1] &&
        s!.blur >= SHADOW_SPEC.blur[0] &&
        s!.blur <= SHADOW_SPEC.blur[1] &&
        Math.abs(s!.offsetY) >= SHADOW_SPEC.offset[0] &&
        Math.abs(s!.offsetY) <= SHADOW_SPEC.offset[1],
    ),
    shadows.map((s) => `${s!.opacity}/${s!.blur}/${s!.offsetY}`).join(' '),
  )
  check(
    'nothing in the brand glows',
    [...VIVIAN.textStyles.map((s) => s.apply.effects), ...VIVIAN.elementStyles.map((e) => e.apply.effects), VIVIAN.cutout.effects].every(
      (e) => !e?.glow.enabled,
    ),
  )
  check('nothing in the brand is stroked', VIVIAN.textStyles.every((s) => (s.apply.strokeWidth ?? 0) === 0))
  check('the presenter carries no sticker outline', VIVIAN.cutout.requireOutline === false && VIVIAN.cutout.effects.outline.enabled === false)

  check('the preset is registered', BRAND_PRESETS.some((b) => b.id === 'vivian'))
  check('the preset is reachable by id', brandPreset('vivian').name === 'Vivian')
  check('the gallery has a category for it', (TEMPLATE_CATEGORIES as readonly string[]).includes('Vivian'))
  check('templates are reachable by brand', templatesForBrand('vivian').length === VIVIAN_TEMPLATES.length)
  check('the brand does not borrow another brand’s layouts', templatesForBrand('vivian').every((t) => !templatesForBrand('super-learner').includes(t)))

  const collisions = VIVIAN.palette.filter((c) => nearestRole(hexToRgb(c.hex)!, VIVIAN) !== c.role)
  check('each brand colour maps to its own role', collisions.length === 0, collisions.map((c) => c.name).join(', '))
  check('an off-brand colour is rejected', nearestRole(hexToRgb('#8B5CF6')!, VIVIAN) === null)

  const project = (objects: SceneObject[], background = DEFAULT_BACKGROUND): Project => ({
    id: 'vv',
    name: 'Vivian',
    format: 'thumbnail',
    brandId: 'vivian',
    width: 1280,
    height: 720,
    safeZone: { top: 4, bottom: 11, left: 3, right: 3, warning: 3 },
    background: { ...background },
    objects,
    createdAt: 0,
    updatedAt: 0,
  })

  for (const template of VIVIAN_TEMPLATES) {
    const built = template.build(1280, 720)
    const items = runBrandQa(project(built.objects, built.background), null, VIVIAN)
    const failed = items.filter((i) => i.status === 'fail' || i.status === 'warn')
    check(
      `layout "${template.name}" passes brand QA`,
      failed.length === 0,
      failed.map((f) => `${f.id}: ${f.detail}`).join(' | '),
    )
    const texts = built.objects.filter((o) => o.type === 'text')
    check(
      `layout "${template.name}" highlights exactly one keyword`,
      texts.filter((t) => t.type === 'text' && t.bgEnabled).length === 1,
    )
    check(
      `layout "${template.name}" keeps every word of copy in the left 60%`,
      texts.every((t) => t.type !== 'text' || t.x + t.width <= 1280 * LAYOUT.textShare),
    )
    check(`layout "${template.name}" carries exactly one icon slot`, built.objects.filter((o) => o.name === VIVIAN.iconSlot!.label).length === 1)
    const subject = built.objects.find((o) => o.name === 'Presenter cut-out')!
    check(
      `layout "${template.name}" sizes the presenter at 30-35% of the width`,
      subject.width >= 1280 * 0.3 && subject.width <= 1280 * 0.35,
      `${subject.width} px`,
    )
    // The brand's whole claim is restraint, so the layer budget is a test, not
    // a suggestion — a layout that needs more has stopped being this brand.
    check(`layout "${template.name}" stays minimal`, built.objects.length <= VIVIAN.rules.maxLayers, `${built.objects.length} layers`)
  }

  // The tightened rules have to bite where Brand 1's would not.
  const status = (items: ReturnType<typeof runBrandQa>, id: string) => items.find((i) => i.id === id)?.status
  const fiveWords = project([
    createText({ text: 'WHY YOU FORGET SO', fontSize: 132, x: 64, y: 100, width: 660, height: 140 }),
    createText({ text: 'FAST', fontSize: 132, x: 64, y: 260, width: 300, height: 176, bgEnabled: true }),
  ])
  check('a five-word headline is flagged', status(runBrandQa(fiveWords, null, VIVIAN), 'title-words') === 'warn')
  const clutter = project(
    Array.from({ length: 12 }, (_, i) => createShape({ name: `Bit ${i}`, x: 64, y: 64, width: 40, height: 40 })),
  )
  check('a cluttered design is flagged', status(runBrandQa(clutter, null, VIVIAN), 'clutter') === 'warn')
  const glowing = project([
    createText({ text: 'GOOD HOOK', fontSize: 132, x: 64, y: 100, width: 600, height: 140, bgEnabled: true, effects: DEEP_GLOW }),
  ])
  check('a neon glow is flagged', status(runBrandQa(glowing, null, VIVIAN), 'shadows') === 'warn')

  const blank = project([])
  const hook = brandTextObject(VIVIAN, 'hook', blank)
  check('a Vivian headline uses the brand font', hook.fontFamily === 'Anton' && hook.color === spec.light)
  check('a Vivian headline stays in the copy column', hook.x + hook.width <= 1280 * LAYOUT.textShare + 1)
  const icon = brandIconSlot(VIVIAN, blank)!
  check('the icon slot is square and empty', icon.width === icon.height && icon.assetId === '')
  const patch = cutoutPatch(VIVIAN)
  check('the cut-out treatment grades the photo gently', patch.adjustments?.contrast === 6 && patch.adjustments?.sharpness === 5)
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)

// ---------------------------------------------------------------------------
// The background remover's editing core: brushes, history, crop and export,
// as pure functions over byte arrays. No DOM and no workers, so the selftest
// runs every line of it in Node.
//
// The model is non-destructive. `original` is the photo and never changes;
// `pixels` is the cut-out — decontaminated colour plus alpha — and is what the
// brushes edit. Restoring therefore always has the true pixels to bring back,
// however many times an area was erased.
// ---------------------------------------------------------------------------

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Matte {
  width: number
  height: number
  /** The photo, RGBA. Read-only. */
  original: Uint8ClampedArray
  /** The cut-out, RGBA: colour with the background's tint removed, and alpha. */
  pixels: Uint8ClampedArray
}

export type BrushMode = 'restore' | 'erase' | 'refine'

export interface Point {
  x: number
  y: number
}

export interface Brush {
  /** Radius in photo pixels. */
  radius: number
  /** 0..1: share of the radius painted at full strength before the falloff. */
  hardness: number
}

export const BRUSH_MIN = 1
export const BRUSH_MAX = 400
export const BRUSH_DEFAULT: Brush = { radius: 24, hardness: 0.6 }

/** The brush-size keys step by this factor, so small brushes move finely. */
export const BRUSH_STEP = 1.15

export function clampRadius(radius: number): number {
  return Math.max(BRUSH_MIN, Math.min(BRUSH_MAX, Math.round(radius)))
}

export function stepRadius(radius: number, direction: 1 | -1): number {
  const next = direction > 0 ? radius * BRUSH_STEP : radius / BRUSH_STEP
  // Always move at least one pixel, or a 1–6 px brush could never grow.
  const moved = direction > 0 ? Math.max(radius + 1, next) : Math.min(radius - 1, next)
  return clampRadius(moved)
}

/** Strength of the brush at `distance` from its centre, 0..1. */
export function falloff(distance: number, brush: Brush): number {
  if (distance > brush.radius) return 0
  const core = brush.radius * Math.max(0, Math.min(1, brush.hardness))
  if (distance <= core) return 1
  const t = (distance - core) / Math.max(1e-6, brush.radius - core)
  // Smoothstep, so a soft brush has no visible ring where the falloff starts.
  return 1 - t * t * (3 - 2 * t)
}

/** Distance from p to the segment ab. */
function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = dx * dx + dy * dy
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len))
  const x = a.x + t * dx - p.x
  const y = a.y + t * dy - p.y
  return Math.sqrt(x * x + y * y)
}

/** The pixels a stroke segment can touch, clipped to the photo. */
export function segmentBounds(a: Point, b: Point, radius: number, width: number, height: number): Rect | null {
  const x0 = Math.max(0, Math.floor(Math.min(a.x, b.x) - radius))
  const y0 = Math.max(0, Math.floor(Math.min(a.y, b.y) - radius))
  const x1 = Math.min(width, Math.ceil(Math.max(a.x, b.x) + radius) + 1)
  const y1 = Math.min(height, Math.ceil(Math.max(a.y, b.y) + radius) + 1)
  if (x1 <= x0 || y1 <= y0) return null
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/**
 * Paints one segment of a restore or erase stroke into `matte.pixels`.
 * Restore pulls both alpha and colour toward the photo — the decontaminated
 * colour of a pixel that was background is meaningless, so a restored pixel
 * must get the photo's own. Erase lowers alpha only. Returns the dirty rect.
 */
export function stampSegment(matte: Matte, a: Point, b: Point, brush: Brush, mode: 'restore' | 'erase'): Rect | null {
  const rect = segmentBounds(a, b, brush.radius, matte.width, matte.height)
  if (!rect) return null
  const { pixels, original, width } = matte
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const w = falloff(segmentDistance({ x: x + 0.5, y: y + 0.5 }, a, b), brush)
      if (w <= 0) continue
      const i = (y * width + x) * 4
      if (mode === 'erase') {
        pixels[i + 3] = Math.round(pixels[i + 3] * (1 - w))
        continue
      }
      pixels[i] = Math.round(pixels[i] + (original[i] - pixels[i]) * w)
      pixels[i + 1] = Math.round(pixels[i + 1] + (original[i + 1] - pixels[i + 1]) * w)
      pixels[i + 2] = Math.round(pixels[i + 2] + (original[i + 2] - pixels[i + 2]) * w)
      pixels[i + 3] = Math.round(pixels[i + 3] + (255 - pixels[i + 3]) * w)
    }
  }
  return rect
}

/**
 * Adds one segment to a refine stroke's coverage. Nothing changes in the
 * cut-out until the stroke ends and matte.py re-solves it, so the coverage is
 * the max of the brush, not a sum — crossing the same spot twice is not a
 * stronger request.
 */
export function stampCoverage(coverage: Uint8Array, width: number, height: number, a: Point, b: Point, brush: Brush): Rect | null {
  const rect = segmentBounds(a, b, brush.radius, width, height)
  if (!rect) return null
  for (let y = rect.y; y < rect.y + rect.height; y++) {
    for (let x = rect.x; x < rect.x + rect.width; x++) {
      const w = falloff(segmentDistance({ x: x + 0.5, y: y + 0.5 }, a, b), brush)
      if (w <= 0) continue
      const i = y * width + x
      coverage[i] = Math.max(coverage[i], Math.round(w * 255))
    }
  }
  return rect
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b
  if (!b) return a
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y }
}

export function growRect(rect: Rect, by: number, width: number, height: number): Rect {
  const x = Math.max(0, rect.x - by)
  const y = Math.max(0, rect.y - by)
  return {
    x,
    y,
    width: Math.min(width, rect.x + rect.width + by) - x,
    height: Math.min(height, rect.y + rect.height + by) - y,
  }
}

/** Copies an RGBA rect out of a buffer. */
export function cropRgba(data: Uint8ClampedArray, width: number, rect: Rect): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4)
  for (let row = 0; row < rect.height; row++) {
    const start = ((rect.y + row) * width + rect.x) * 4
    out.set(data.subarray(start, start + rect.width * 4), row * rect.width * 4)
  }
  return out
}

/** Copies a one-byte-per-pixel rect out of a buffer. */
export function cropBytes(data: Uint8Array, width: number, rect: Rect, channel = -1): Uint8Array {
  const out = new Uint8Array(rect.width * rect.height)
  for (let row = 0; row < rect.height; row++) {
    for (let col = 0; col < rect.width; col++) {
      const i = (rect.y + row) * width + rect.x + col
      out[row * rect.width + col] = channel < 0 ? data[i] : data[i * 4 + channel]
    }
  }
  return out
}

/** The alpha channel of an RGBA rect, as bytes. */
export function alphaOf(data: Uint8ClampedArray, width: number, rect: Rect): Uint8Array {
  return cropBytes(data as unknown as Uint8Array, width, rect, 3)
}

/**
 * Writes a refine result back, but only where the stroke covered: the solve
 * sees a margin around the stroke for context and must not repaint it. A soft
 * brush edge blends the new result in rather than cutting it in.
 */
export function blendRefine(matte: Matte, rect: Rect, result: Uint8ClampedArray, coverage: Uint8Array): void {
  for (let row = 0; row < rect.height; row++) {
    for (let col = 0; col < rect.width; col++) {
      const w = coverage[(rect.y + row) * matte.width + rect.x + col] / 255
      if (w <= 0) continue
      const i = ((rect.y + row) * matte.width + rect.x + col) * 4
      const j = (row * rect.width + col) * 4
      for (let c = 0; c < 4; c++) matte.pixels[i + c] = Math.round(matte.pixels[i + c] + (result[j + c] - matte.pixels[i + c]) * w)
    }
  }
}

// --------------------------------------------------------------- history ---

interface Tile {
  index: number
  before: Uint8ClampedArray
  after: Uint8ClampedArray | null
}

interface Patch {
  tiles: Tile[]
  bytes: number
}

/**
 * Undo for the cut-out, one step per stroke. A step stores only the tiles the
 * stroke touched, before and after, so a dab on a 12 MP photo costs a few
 * kilobytes rather than the 48 MB of a whole-frame snapshot. Old steps are
 * dropped past a byte budget, not a count — one re-run of the whole cut-out
 * weighs as much as hundreds of dabs.
 */
export class EditHistory {
  readonly tile: number
  readonly budget: number
  private readonly columns: number
  private readonly rows: number
  private past: Patch[] = []
  private future: Patch[] = []
  private open: Map<number, Tile> | null = null

  constructor(
    readonly width: number,
    readonly height: number,
    options: { tile?: number; budget?: number } = {},
  ) {
    this.tile = options.tile ?? 64
    this.budget = options.budget ?? 384 * 1024 * 1024
    this.columns = Math.ceil(width / this.tile)
    this.rows = Math.ceil(height / this.tile)
  }

  get canUndo(): boolean {
    return this.past.length > 0
  }

  get canRedo(): boolean {
    return this.future.length > 0
  }

  get steps(): number {
    return this.past.length
  }

  begin(): void {
    this.open = new Map()
  }

  /** Call before changing `rect`: saves each tile in it the first time this step touches it. */
  touch(matte: Matte, rect: Rect | null): void {
    if (!this.open || !rect) return
    const c0 = Math.floor(rect.x / this.tile)
    const r0 = Math.floor(rect.y / this.tile)
    const c1 = Math.min(this.columns - 1, Math.floor((rect.x + rect.width - 1) / this.tile))
    const r1 = Math.min(this.rows - 1, Math.floor((rect.y + rect.height - 1) / this.tile))
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const index = r * this.columns + c
        if (this.open.has(index)) continue
        this.open.set(index, { index, before: cropRgba(matte.pixels, this.width, this.tileRect(index)), after: null })
      }
    }
  }

  /** Closes the step. Returns false (and records nothing) if nothing was touched. */
  commit(matte: Matte): boolean {
    const open = this.open
    this.open = null
    if (!open || open.size === 0) return false
    const tiles = [...open.values()]
    let bytes = 0
    for (const tile of tiles) {
      tile.after = cropRgba(matte.pixels, this.width, this.tileRect(tile.index))
      bytes += tile.before.length + tile.after.length
    }
    this.past.push({ tiles, bytes })
    this.future = []
    let total = this.past.reduce((sum, p) => sum + p.bytes, 0)
    while (total > this.budget && this.past.length > 1) total -= this.past.shift()!.bytes
    return true
  }

  /** Abandons an open step, putting back what it changed. */
  cancel(matte: Matte): void {
    const open = this.open
    this.open = null
    if (open) for (const tile of open.values()) this.write(matte, tile.index, tile.before)
  }

  undo(matte: Matte): Rect | null {
    const patch = this.past.pop()
    if (!patch) return null
    this.future.push(patch)
    return this.apply(matte, patch, 'before')
  }

  redo(matte: Matte): Rect | null {
    const patch = this.future.pop()
    if (!patch) return null
    this.past.push(patch)
    return this.apply(matte, patch, 'after')
  }

  clear(): void {
    this.past = []
    this.future = []
    this.open = null
  }

  private apply(matte: Matte, patch: Patch, side: 'before' | 'after'): Rect | null {
    let dirty: Rect | null = null
    for (const tile of patch.tiles) {
      this.write(matte, tile.index, side === 'before' ? tile.before : tile.after!)
      dirty = unionRect(dirty, this.tileRect(tile.index))
    }
    return dirty
  }

  private write(matte: Matte, index: number, data: Uint8ClampedArray): void {
    const rect = this.tileRect(index)
    for (let row = 0; row < rect.height; row++) {
      matte.pixels.set(
        data.subarray(row * rect.width * 4, (row + 1) * rect.width * 4),
        ((rect.y + row) * this.width + rect.x) * 4,
      )
    }
  }

  private tileRect(index: number): Rect {
    const x = (index % this.columns) * this.tile
    const y = Math.floor(index / this.columns) * this.tile
    return { x, y, width: Math.min(this.tile, this.width - x), height: Math.min(this.tile, this.height - y) }
  }
}

// ------------------------------------------------------------------ crop ---

export interface AspectPreset {
  id: string
  label: string
  /** width / height; null is free, 0 is the photo's own. */
  ratio: number | null
}

export const ASPECTS: AspectPreset[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: 0 },
  { id: 'square', label: '1:1', ratio: 1 },
  { id: 'portrait', label: '4:5', ratio: 4 / 5 },
  { id: 'wide', label: '16:9', ratio: 16 / 9 },
  { id: 'tall', label: '9:16', ratio: 9 / 16 },
]

/** The smallest a crop may get, in photo pixels. */
export const CROP_MIN = 16

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | 'move'

export function fullRect(width: number, height: number): Rect {
  return { x: 0, y: 0, width, height }
}

export function resolveRatio(preset: AspectPreset, width: number, height: number): number | null {
  if (preset.ratio === null) return null
  return preset.ratio === 0 ? width / height : preset.ratio
}

/**
 * The largest rect of `ratio` that fits in `within`, centred on `around`.
 * With `keepTop`, a rect that has to lose height loses it from the bottom:
 * fitting a standing person into a square should keep the head, not the feet.
 */
export function fitAspect(around: Rect, ratio: number, within: Rect, keepTop = false): Rect {
  const cx = around.x + around.width / 2
  const cy = around.y + around.height / 2
  let width = around.width
  let height = width / ratio
  if (height > around.height) {
    height = around.height
    width = height * ratio
  }
  // Grow back toward the larger of the two if `around` was narrower than the frame allows.
  const scale = Math.min(within.width / width, within.height / height, Math.max(around.width / width, around.height / height))
  width *= scale
  height *= scale
  const x = Math.max(within.x, Math.min(within.x + within.width - width, cx - width / 2))
  const wantY = keepTop && height < around.height ? around.y : cy - height / 2
  const y = Math.max(within.y, Math.min(within.y + within.height - height, wantY))
  return roundRect({ x, y, width, height })
}

function roundRect(rect: Rect): Rect {
  const x = Math.round(rect.x)
  const y = Math.round(rect.y)
  return { x, y, width: Math.round(rect.x + rect.width) - x, height: Math.round(rect.y + rect.height) - y }
}

/**
 * Drags one handle of the crop by (dx, dy) photo pixels. Edges stop at the
 * photo and at CROP_MIN; with a ratio the opposite corner (or edge centre)
 * stays put and the rect keeps its shape.
 */
export function dragCrop(start: Rect, handle: CropHandle, dx: number, dy: number, ratio: number | null, bounds: Rect): Rect {
  if (handle === 'move') {
    const x = Math.max(bounds.x, Math.min(bounds.x + bounds.width - start.width, start.x + dx))
    const y = Math.max(bounds.y, Math.min(bounds.y + bounds.height - start.height, start.y + dy))
    return roundRect({ x, y, width: start.width, height: start.height })
  }
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height
  if (handle.includes('w')) left = Math.min(right - CROP_MIN, Math.max(bounds.x, left + dx))
  if (handle.includes('e')) right = Math.max(left + CROP_MIN, Math.min(bounds.x + bounds.width, right + dx))
  if (handle.includes('n')) top = Math.min(bottom - CROP_MIN, Math.max(bounds.y, top + dy))
  if (handle.includes('s')) bottom = Math.max(top + CROP_MIN, Math.min(bounds.y + bounds.height, bottom + dy))
  if (ratio === null) return roundRect({ x: left, y: top, width: right - left, height: bottom - top })

  // Keep the ratio: the dragged dimension leads (both for a corner — the
  // larger change wins), and the rect is anchored at the opposite side.
  let width = right - left
  let height = bottom - top
  const corner = handle.length === 2
  if (handle === 'n' || handle === 's' || (corner && Math.abs(dy) * ratio > Math.abs(dx))) width = height * ratio
  else height = width / ratio
  // Shrink to fit the photo from the anchor.
  const anchorX = handle.includes('w') ? right : handle.includes('e') ? left : start.x + start.width / 2
  const anchorY = handle.includes('n') ? bottom : handle.includes('s') ? top : start.y + start.height / 2
  const roomX = handle.includes('w')
    ? anchorX - bounds.x
    : handle.includes('e')
      ? bounds.x + bounds.width - anchorX
      : 2 * Math.min(anchorX - bounds.x, bounds.x + bounds.width - anchorX)
  const roomY = handle.includes('n')
    ? anchorY - bounds.y
    : handle.includes('s')
      ? bounds.y + bounds.height - anchorY
      : 2 * Math.min(anchorY - bounds.y, bounds.y + bounds.height - anchorY)
  const fit = Math.min(1, roomX / width, roomY / height)
  width = Math.max(CROP_MIN, width * fit)
  height = Math.max(CROP_MIN, height * fit)
  const x = handle.includes('w') ? anchorX - width : handle.includes('e') ? anchorX : anchorX - width / 2
  const y = handle.includes('n') ? anchorY - height : handle.includes('s') ? anchorY : anchorY - height / 2
  return roundRect({ x, y, width, height })
}

/** The bounding box of everything at least `threshold` opaque, or null for an empty cut-out. */
export function subjectBounds(pixels: Uint8ClampedArray, width: number, height: number, threshold = 8): Rect | null {
  let x0 = width
  let y0 = height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (pixels[row + x * 4 + 3] < threshold) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return null
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
}

/** Trim to the subject with a margin of `pad` (a share of its larger side). */
export function trimToSubject(pixels: Uint8ClampedArray, width: number, height: number, pad = 0.04): Rect | null {
  const bounds = subjectBounds(pixels, width, height)
  if (!bounds) return null
  return growRect(bounds, Math.round(Math.max(bounds.width, bounds.height) * pad), width, height)
}

// ---------------------------------------------------------------- export ---

export type OutputFormat = 'png' | 'jpeg'

export interface OutputImage {
  width: number
  height: number
  data: Uint8ClampedArray<ArrayBuffer>
}

export function parseHex(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return [255, 255, 255]
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/**
 * The file's pixels: the crop of the cut-out, and for JPEG — which has no
 * alpha — the cut-out composited onto `background`. Without that, the encoder
 * writes every transparent pixel as black.
 */
export function renderOutput(matte: Matte, crop: Rect, format: OutputFormat, background = '#ffffff'): OutputImage {
  const data = cropRgba(matte.pixels, matte.width, crop)
  if (format === 'jpeg') {
    const [r, g, b] = parseHex(background)
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255
      data[i] = Math.round(data[i] * a + r * (1 - a))
      data[i + 1] = Math.round(data[i + 1] * a + g * (1 - a))
      data[i + 2] = Math.round(data[i + 2] * a + b * (1 - a))
      data[i + 3] = 255
    }
  }
  return { width: crop.width, height: crop.height, data }
}

export function outputName(source: string, format: OutputFormat): string {
  const base =
    source
      .replace(/\.[a-z0-9]+$/i, '')
      .trim()
      .replace(/[^a-z0-9-_ ]/gi, '')
      .replace(/\s+/g, '-')
      .toLowerCase() || 'photo'
  return `${base}-no-background.${format === 'jpeg' ? 'jpg' : 'png'}`
}

/**
 * Photos are worked on at most this many pixels on the long side. The matte
 * holds several full-size buffers, and under WebAssembly a 24 MP phone photo
 * would cost a minute and a gigabyte; 4096 px is still sharper than anything a
 * thumbnail or a profile picture needs.
 */
export const MAX_EDGE = 4096

export function workingSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number; scale: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale }
}

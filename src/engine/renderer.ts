import { DEFAULT_MASK } from '../types'
import type {
  Adjustments,
  Background,
  Effects,
  FadeFrom,
  FeatherMask,
  ImageObject,
  Project,
  SceneObject,
  ShapeObject,
  TextObject,
} from '../types'
import { getLoadedAsset } from './assets'
import { FILTER_BY_ID, scaleFilter } from '../data/filters'
import { applyTextFont, drawLine, layoutText, lineGeometry, measureLine, textRasterPadding } from './text'

type Ctx = CanvasRenderingContext2D

// ---------------------------------------------------------------------------
// Raster cache — each object is drawn once into an offscreen canvas (including
// its effects) and re-used until one of its visual properties changes. Moving,
// rotating and fading an object therefore costs a single drawImage.
// ---------------------------------------------------------------------------

interface RasterEntry {
  key: string
  canvas: HTMLCanvasElement
  pad: number
}

const rasterCache = new Map<string, RasterEntry>()

const TRANSFORM_KEYS = new Set(['x', 'y', 'rotation', 'opacity', 'locked', 'hidden', 'name', 'groupId'])

function visualKey(obj: SceneObject, scale: number): string {
  const parts: string[] = [scale.toFixed(3)]
  for (const [k, v] of Object.entries(obj)) {
    if (TRANSFORM_KEYS.has(k)) continue
    parts.push(`${k}:${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
  }
  if (obj.type === 'image') {
    const a = getLoadedAsset(obj.useCutout && obj.cutoutAssetId ? obj.cutoutAssetId : obj.assetId)
    parts.push(`loaded:${a ? a.width + 'x' + a.height : 'none'}`)
  }
  return parts.join('|')
}

export function invalidateRaster(id?: string): void {
  if (id) rasterCache.delete(id)
  else rasterCache.clear()
}

function effectPadding(effects: Effects): number {
  let pad = 2
  if (effects.outline.enabled) pad = Math.max(pad, effects.outline.width + 2)
  if (effects.glow.enabled) pad = Math.max(pad, effects.glow.blur * 1.5)
  if (effects.shadow.enabled) {
    pad = Math.max(pad, effects.shadow.blur + Math.abs(effects.shadow.offsetX), effects.shadow.blur + Math.abs(effects.shadow.offsetY))
  }
  return Math.ceil(pad)
}

/**
 * How far past its box a layer's mask can reach. Only a 'subject' mask can:
 * feathering the layer's own alpha spreads it outward, and expansion grows it.
 * A drawn region is clamped inside the box, so it needs no room.
 */
export function maskPadding(mask: FeatherMask): number {
  if (!mask.enabled || mask.shape === 'rect' || mask.shape === 'ellipse') return 0
  return Math.ceil(mask.feather / 2 + Math.max(0, mask.expand) + 2)
}

/**
 * Distance a drawn mask sits inside the layer box, so the whole falloff lands
 * on the layer instead of half of it being clipped away at the edge. Expansion
 * pushes it back out; it never leaves the box, where there is nothing to show.
 */
export function maskInset(mask: FeatherMask): number {
  return Math.max(0, mask.feather / 2 - mask.expand)
}

function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

/** Flat colour version of a layer, used for outline / glow / shadow passes. */
function silhouette(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = createCanvas(source.width, source.height)
  const c = out.getContext('2d')!
  c.drawImage(source, 0, 0)
  c.globalCompositeOperation = 'source-in'
  c.fillStyle = color
  c.fillRect(0, 0, out.width, out.height)
  return out
}

/**
 * Morphological dilation: the union of the silhouette translated around a
 * circle, which is what an outline is. 48 steps is the point past which a
 * thick outline stops showing facets.
 */
function dilate(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius <= 0) return source
  const out = createCanvas(source.width, source.height)
  const ctx = out.getContext('2d')!
  const steps = 48
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2
    ctx.drawImage(source, Math.cos(a) * radius, Math.sin(a) * radius)
  }
  ctx.drawImage(source, 0, 0)
  return out
}

/** Erosion is dilation of the inverse, punched back out of the original. */
function erode(source: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  if (radius <= 0) return source
  const inverse = createCanvas(source.width, source.height)
  const ictx = inverse.getContext('2d')!
  ictx.fillStyle = '#ffffff'
  ictx.fillRect(0, 0, inverse.width, inverse.height)
  ictx.globalCompositeOperation = 'destination-out'
  ictx.drawImage(source, 0, 0)

  const out = createCanvas(source.width, source.height)
  const ctx = out.getContext('2d')!
  ctx.drawImage(source, 0, 0)
  ctx.globalCompositeOperation = 'destination-out'
  ctx.drawImage(dilate(inverse, radius), 0, 0)
  return out
}

/**
 * Premiere Pro's mask, minus the drawn path: a region that reveals the layer,
 * with a soft edge. It is applied to the content *before* effects, so an
 * outline or shadow follows the feathered shape rather than the original box.
 */
function applyMask(content: HTMLCanvasElement, obj: SceneObject, scale: number, pad: number): HTMLCanvasElement {
  const mask = obj.mask ?? DEFAULT_MASK
  const region = createCanvas(content.width, content.height)
  const rctx = region.getContext('2d')!
  // Matches the convention used by the shadow and glow passes: a CSS blur of
  // r reads as a soft edge about 2r wide.
  const blur = (mask.feather * scale) / 2

  if (mask.shape === 'subject') {
    let sil = silhouette(content, '#ffffff')
    const grow = mask.expand * scale
    if (grow > 0) sil = dilate(sil, grow)
    else if (grow < 0) sil = erode(sil, -grow)
    if (blur > 0) rctx.filter = `blur(${blur}px)`
    rctx.drawImage(sil, 0, 0)
  } else {
    const inset = maskInset(mask) * scale
    const x = pad * scale + inset
    const y = pad * scale + inset
    const w = obj.width * scale - inset * 2
    const h = obj.height * scale - inset * 2
    if (w > 0 && h > 0) {
      if (blur > 0) rctx.filter = `blur(${blur}px)`
      rctx.fillStyle = '#ffffff'
      if (mask.shape === 'ellipse') {
        rctx.beginPath()
        rctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        rctx.fill()
      } else {
        rctx.fillRect(x, y, w, h)
      }
    }
  }

  const out = createCanvas(content.width, content.height)
  const octx = out.getContext('2d')!
  octx.drawImage(content, 0, 0)
  octx.globalCompositeOperation = mask.invert ? 'destination-out' : 'destination-in'
  octx.drawImage(region, 0, 0)
  return out
}

function getEffects(obj: SceneObject): Effects | null {
  return 'effects' in obj ? obj.effects : null
}

function rasterize(obj: SceneObject, scale: number): RasterEntry {
  const effects = getEffects(obj)
  // Text can spill past its box when the line height is tighter than the ink,
  // so the offscreen canvas grows to match rather than clipping the glyphs.
  const mask = obj.mask ?? DEFAULT_MASK
  const pad = Math.max(
    effects ? effectPadding(effects) : 2,
    obj.type === 'text' ? textRasterPadding(obj) + 2 : 0,
    maskPadding(mask),
  )
  const w = (obj.width + pad * 2) * scale
  const h = (obj.height + pad * 2) * scale

  const drawn = createCanvas(w, h)
  const cctx = drawn.getContext('2d')!
  cctx.scale(scale, scale)
  cctx.translate(pad, pad)
  drawContent(cctx, obj)
  const content = mask.enabled ? applyMask(drawn, obj, scale, pad) : drawn

  if (!effects || (!effects.outline.enabled && !effects.glow.enabled && !effects.shadow.enabled && !effects.overlay.enabled)) {
    return { key: '', canvas: content, pad }
  }

  const out = createCanvas(w, h)
  const octx = out.getContext('2d')!

  if (effects.shadow.enabled) {
    const sil = silhouette(content, effects.shadow.color)
    octx.save()
    octx.globalAlpha = effects.shadow.opacity / 100
    if (effects.shadow.blur > 0) octx.filter = `blur(${(effects.shadow.blur * scale) / 2}px)`
    octx.drawImage(sil, effects.shadow.offsetX * scale, effects.shadow.offsetY * scale)
    octx.restore()
  }

  if (effects.glow.enabled) {
    const sil = silhouette(content, effects.glow.color)
    octx.save()
    octx.filter = `blur(${(effects.glow.blur * scale) / 2}px)`
    for (let i = 0; i < Math.max(1, Math.round(effects.glow.intensity)); i++) octx.drawImage(sil, 0, 0)
    octx.restore()
  }

  if (effects.outline.enabled && effects.outline.width > 0) {
    octx.drawImage(dilate(silhouette(content, effects.outline.color), effects.outline.width * scale), 0, 0)
  }

  octx.drawImage(content, 0, 0)

  if (effects.overlay.enabled) {
    const sil = silhouette(content, effects.overlay.color)
    octx.save()
    octx.globalAlpha = effects.overlay.opacity / 100
    octx.drawImage(sil, 0, 0)
    octx.restore()
  }

  return { key: '', canvas: out, pad }
}

function getRaster(obj: SceneObject, scale: number): RasterEntry {
  const key = visualKey(obj, scale)
  const cached = rasterCache.get(obj.id)
  if (cached && cached.key === key) return cached
  const entry = rasterize(obj, scale)
  entry.key = key
  // Off-screen previews (templates, export) churn through ids; keep the cache
  // from growing without bound.
  if (rasterCache.size > 200) rasterCache.clear()
  rasterCache.set(obj.id, entry)
  return entry
}

// ---------------------------------------------------------------------------
// Content drawing
// ---------------------------------------------------------------------------

export function buildImageFilter(adj: Adjustments, filterId: string, strength: number): string {
  const parts: string[] = []
  const preset = FILTER_BY_ID.get(filterId)
  if (preset?.css) parts.push(scaleFilter(preset.css, strength))
  const brightness = 1 + (adj.brightness / 100) * 0.8 + (adj.exposure / 100) * 0.6
  const contrast = 1 + (adj.contrast / 100) * 0.8
  const saturate = Math.max(0, 1 + adj.saturation / 100)
  if (Math.abs(brightness - 1) > 0.001) parts.push(`brightness(${brightness.toFixed(3)})`)
  if (Math.abs(contrast - 1) > 0.001) parts.push(`contrast(${contrast.toFixed(3)})`)
  if (Math.abs(saturate - 1) > 0.001) parts.push(`saturate(${saturate.toFixed(3)})`)
  if (adj.blur > 0) parts.push(`blur(${((adj.blur / 100) * 20).toFixed(2)}px)`)
  return parts.filter(Boolean).join(' ')
}

function roundRectPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Tonal tweaks Canvas filters cannot express, approximated with blend layers. */
function applyToneLayers(ctx: Ctx, adj: Adjustments, w: number, h: number): void {
  const layer = (color: string, amount: number, mode: GlobalCompositeOperation) => {
    if (amount <= 0.001) return
    ctx.save()
    ctx.globalCompositeOperation = mode
    ctx.globalAlpha = Math.min(0.85, amount)
    ctx.fillStyle = color
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }
  if (adj.temperature > 0) layer('#ff9a3c', (adj.temperature / 100) * 0.55, 'soft-light')
  if (adj.temperature < 0) layer('#3c9aff', (-adj.temperature / 100) * 0.55, 'soft-light')
  if (adj.tint > 0) layer('#ff3cc8', (adj.tint / 100) * 0.45, 'soft-light')
  if (adj.tint < 0) layer('#5cff3c', (-adj.tint / 100) * 0.45, 'soft-light')
  if (adj.highlights > 0) layer('#ffffff', (adj.highlights / 100) * 0.5, 'soft-light')
  if (adj.highlights < 0) layer('#8c8c8c', (-adj.highlights / 100) * 0.5, 'multiply')
  if (adj.shadows > 0) layer('#ffffff', (adj.shadows / 100) * 0.35, 'screen')
  if (adj.shadows < 0) layer('#000000', (-adj.shadows / 100) * 0.45, 'soft-light')
}

/** Unsharp mask on the rasterised layer; only runs when the slider is moved. */
function applySharpness(ctx: Ctx, amount: number, w: number, h: number): void {
  if (amount <= 0) return
  const pw = Math.max(1, Math.round(w))
  const ph = Math.max(1, Math.round(h))
  let src: ImageData
  try {
    src = ctx.getImageData(0, 0, pw, ph)
  } catch {
    return
  }
  const out = ctx.createImageData(pw, ph)
  const k = (amount / 100) * 1.2
  const s = src.data
  const d = out.data
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4
      for (let c = 0; c < 3; c++) {
        const center = s[i + c]
        const left = x > 0 ? s[i - 4 + c] : center
        const right = x < pw - 1 ? s[i + 4 + c] : center
        const up = y > 0 ? s[i - pw * 4 + c] : center
        const down = y < ph - 1 ? s[i + pw * 4 + c] : center
        const lap = center * 4 - left - right - up - down
        d[i + c] = Math.max(0, Math.min(255, center + lap * k))
      }
      d[i + 3] = s[i + 3]
    }
  }
  ctx.putImageData(out, 0, 0)
}

function drawImageObject(ctx: Ctx, obj: ImageObject): void {
  const asset = getLoadedAsset(obj.useCutout && obj.cutoutAssetId ? obj.cutoutAssetId : obj.assetId)
  const { width: w, height: h } = obj
  if (!asset) {
    ctx.save()
    ctx.fillStyle = 'rgba(148,163,184,0.18)'
    roundRectPath(ctx, 0, 0, w, h, obj.cornerRadius)
    ctx.fill()
    ctx.restore()
    return
  }
  ctx.save()
  if (obj.cornerRadius > 0) {
    roundRectPath(ctx, 0, 0, w, h, obj.cornerRadius)
    ctx.clip()
  }
  ctx.save()
  ctx.translate(obj.flipH ? w : 0, obj.flipV ? h : 0)
  ctx.scale(obj.flipH ? -1 : 1, obj.flipV ? -1 : 1)
  const filter = buildImageFilter(obj.adjustments, obj.filter, obj.filterStrength)
  if (filter) ctx.filter = filter
  const sx = obj.crop.x * asset.width
  const sy = obj.crop.y * asset.height
  const sw = Math.max(1, obj.crop.width * asset.width)
  const sh = Math.max(1, obj.crop.height * asset.height)
  ctx.drawImage(asset.bitmap, sx, sy, sw, sh, 0, 0, w, h)
  ctx.restore()
  applyToneLayers(ctx, obj.adjustments, w, h)
  ctx.restore()
}

function shapePath(obj: ShapeObject): Path2D | null {
  const { width: w, height: h } = obj
  const p = new Path2D()
  switch (obj.shape) {
    case 'rect':
      p.rect(0, 0, w, h)
      return p
    case 'roundRect': {
      const r = Math.max(0, Math.min(obj.cornerRadius, Math.min(w, h) / 2))
      p.moveTo(r, 0)
      p.arcTo(w, 0, w, h, r)
      p.arcTo(w, h, 0, h, r)
      p.arcTo(0, h, 0, 0, r)
      p.arcTo(0, 0, w, 0, r)
      p.closePath()
      return p
    }
    case 'ellipse':
      p.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      return p
    case 'triangle':
      p.moveTo(w / 2, 0)
      p.lineTo(w, h)
      p.lineTo(0, h)
      p.closePath()
      return p
    case 'line':
      p.rect(0, h / 2 - obj.strokeWidth / 2, w, Math.max(1, obj.strokeWidth))
      return p
    case 'arrow': {
      const head = Math.min(w * 0.4, h)
      const bodyTop = h * 0.3
      p.moveTo(0, bodyTop)
      p.lineTo(w - head, bodyTop)
      p.lineTo(w - head, 0)
      p.lineTo(w, h / 2)
      p.lineTo(w - head, h)
      p.lineTo(w - head, h - bodyTop)
      p.lineTo(0, h - bodyTop)
      p.closePath()
      return p
    }
    case 'polygon':
    case 'star': {
      const n = Math.max(3, Math.round(obj.points))
      const steps = obj.shape === 'star' ? n * 2 : n
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 - Math.PI / 2
        const radius = obj.shape === 'star' && i % 2 === 1 ? obj.innerRatio : 1
        const x = w / 2 + Math.cos(a) * (w / 2) * radius
        const y = h / 2 + Math.sin(a) * (h / 2) * radius
        if (i === 0) p.moveTo(x, y)
        else p.lineTo(x, y)
      }
      p.closePath()
      return p
    }
    case 'path': {
      if (!obj.pathData) return null
      const src = new Path2D(obj.pathData)
      const [vw, vh] = obj.pathViewBox
      const scaled = new Path2D()
      scaled.addPath(src, new DOMMatrix([w / vw, 0, 0, h / vh, 0, 0]))
      return scaled
    }
    default:
      return null
  }
}

/** `#rgb` / `#rrggbb` with an alpha applied; anything else is passed through. */
function withAlpha(color: string, alpha: number): string {
  const hex = color.trim()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex)
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  const parts = short
    ? [short[1] + short[1], short[2] + short[2], short[3] + short[3]]
    : full
      ? [full[1], full[2], full[3]]
      : null
  if (!parts) return alpha <= 0 ? 'transparent' : color
  const [r, g, b] = parts.map((p) => parseInt(p, 16))
  return `rgba(${r},${g},${b},${alpha})`
}

/**
 * The scrim gradient: solid at `from`, transparent away from it. Softness sets
 * how wide the transition is and midpoint where it sits, both as a share of the
 * shape. The fade's angle is the layer's rotation, applied by the caller.
 */
export function fadeStops(fade: { softness: number; midpoint: number }): [number, number] {
  const mid = Math.max(0, Math.min(1, fade.midpoint / 100))
  const half = Math.max(0, Math.min(1, fade.softness / 100)) / 2
  const start = Math.max(0, Math.min(1, mid - half))
  // Two stops at the same offset would be a degenerate gradient, so a hard
  // edge is the smallest step the canvas can express rather than none.
  const end = Math.max(start + 0.0001, Math.min(1, mid + half))
  return [start, end]
}

/**
 * Direction the fill travels as it fades out, as a unit vector.
 *
 * `angle` is read off a protractor: 90° is square to the side the shadow comes
 * from, so the edge is a straight vertical (or horizontal) line, and smaller
 * angles lean it towards a diagonal. The gradient runs perpendicular to that
 * edge, which is why the vector is (sin, cos) and not (cos, sin) — at 90° it
 * has to come out as the plain axis-aligned direction the shape had before
 * there was an angle at all.
 */
export function fadeVector(from: FadeFrom, angle: number): { x: number; y: number } {
  const theta = (Math.max(1, Math.min(90, angle)) * Math.PI) / 180
  const sin = Math.sin(theta)
  const cos = Math.cos(theta)
  switch (from) {
    case 'right':
      return { x: -sin, y: cos }
    case 'top':
      return { x: cos, y: sin }
    case 'bottom':
      return { x: cos, y: -sin }
    default:
      return { x: sin, y: cos }
  }
}

function fadeFill(ctx: Ctx, obj: ShapeObject): CanvasGradient | string {
  const { width: w, height: h } = obj
  let gradient: CanvasGradient
  if (obj.fade.from === 'center' || obj.fade.from === 'edges') {
    gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) / 2)
  } else {
    const d = fadeVector(obj.fade.from, obj.fade.angle ?? 90)
    // The box's own extent along the fade direction, so the stops still span
    // the whole shape once the edge is leaning.
    const extent = Math.abs(d.x) * w + Math.abs(d.y) * h
    gradient = ctx.createLinearGradient(
      w / 2 - (d.x * extent) / 2,
      h / 2 - (d.y * extent) / 2,
      w / 2 + (d.x * extent) / 2,
      h / 2 + (d.y * extent) / 2,
    )
  }
  const [start, end] = fadeStops(obj.fade)
  const solid = withAlpha(obj.fill, 1)
  const clear = withAlpha(obj.fill, 0)
  // A vignette runs the other way: clear in the middle, solid at the rim.
  if (obj.fade.from === 'edges') {
    gradient.addColorStop(start, clear)
    gradient.addColorStop(end, solid)
  } else {
    gradient.addColorStop(start, solid)
    gradient.addColorStop(end, clear)
  }
  return gradient
}

function drawShapeObject(ctx: Ctx, obj: ShapeObject): void {
  const path = shapePath(obj)
  if (!path) return
  if (obj.fillEnabled) {
    ctx.fillStyle = obj.fade?.enabled ? fadeFill(ctx, obj) : obj.fill
    ctx.fill(path, 'nonzero')
  }
  if (obj.strokeEnabled && obj.strokeWidth > 0 && obj.shape !== 'line') {
    ctx.lineWidth = obj.strokeWidth
    ctx.strokeStyle = obj.stroke
    ctx.lineJoin = 'round'
    ctx.stroke(path)
  }
}

function drawTextObject(ctx: Ctx, obj: TextObject): void {
  const layout = layoutText(ctx, obj)
  applyTextFont(ctx, obj)
  // An alphabetic baseline placed from measured ink, rather than 'middle',
  // which centres the font's ascent+descent box and pushes caps off the plate.
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = obj.align
  const pad = obj.bgEnabled ? obj.bgPadding : 0
  const x = obj.align === 'left' ? pad : obj.align === 'right' ? obj.width - pad : obj.width / 2
  const geometry = lineGeometry(layout.lineHeight, layout.ink, pad)

  if (obj.bgEnabled) {
    ctx.save()
    ctx.fillStyle = obj.bgColor
    layout.lines.forEach((line, i) => {
      if (!line) return
      const lw = measureLine(ctx, line, obj.letterSpacing)
      // The plate hugs the ink, so the letters always sit inside it.
      const top = i * layout.lineHeight + pad + geometry.plateTop
      const left = obj.align === 'left' ? 0 : obj.align === 'right' ? obj.width - lw - pad * 2 : (obj.width - lw) / 2 - pad
      roundRectPath(ctx, left, top, lw + pad * 2, geometry.plateHeight, obj.bgRadius)
      ctx.fill()
    })
    ctx.restore()
    applyTextFont(ctx, obj)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = obj.align
  }

  layout.lines.forEach((line, i) => {
    const y = i * layout.lineHeight + pad + geometry.baseline
    if (obj.strokeWidth > 0) {
      ctx.save()
      ctx.lineWidth = obj.strokeWidth * 2
      ctx.strokeStyle = obj.strokeColor
      ctx.lineJoin = 'round'
      ctx.miterLimit = 2
      drawLine(ctx, line, x, y, obj.letterSpacing, 'stroke')
      ctx.restore()
    }
    if (obj.color !== 'transparent') {
      ctx.fillStyle = obj.color
      drawLine(ctx, line, x, y, obj.letterSpacing, 'fill')
    }
  })
}

function drawContent(ctx: Ctx, obj: SceneObject): void {
  switch (obj.type) {
    case 'image':
      drawImageObject(ctx, obj)
      if (obj.adjustments.sharpness > 0) {
        const c = ctx.canvas
        ctx.save()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        applySharpness(ctx, obj.adjustments.sharpness, c.width, c.height)
        ctx.restore()
      }
      break
    case 'shape':
      drawShapeObject(ctx, obj)
      break
    case 'text':
      drawTextObject(ctx, obj)
      break
  }
}

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

function gradientFor(ctx: Ctx, bg: Background, w: number, h: number): CanvasGradient {
  const { direction, from, to } = bg.gradient
  let g: CanvasGradient
  switch (direction) {
    case 'to-right':
      g = ctx.createLinearGradient(0, 0, w, 0)
      break
    case 'to-bottom':
      g = ctx.createLinearGradient(0, 0, 0, h)
      break
    case 'to-left':
      g = ctx.createLinearGradient(w, 0, 0, 0)
      break
    case 'to-bottom-left':
      g = ctx.createLinearGradient(w, 0, 0, h)
      break
    case 'radial':
      g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.05, w / 2, h / 2, Math.max(w, h) * 0.75)
      break
    default:
      g = ctx.createLinearGradient(0, 0, w, h)
  }
  g.addColorStop(0, from)
  g.addColorStop(1, to)
  return g
}

function drawPattern(ctx: Ctx, bg: Background, w: number, h: number): void {
  const { kind, color, background, scale } = bg.pattern
  ctx.fillStyle = background
  ctx.fillRect(0, 0, w, h)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  const step = Math.max(6, scale)
  switch (kind) {
    case 'grid':
      ctx.lineWidth = Math.max(1, step / 40)
      ctx.globalAlpha = 0.65
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(w, y)
        ctx.stroke()
      }
      break
    case 'dots':
      for (let y = step / 2; y < h; y += step) {
        for (let x = step / 2; x < w; x += step) {
          ctx.beginPath()
          ctx.arc(x, y, Math.max(1, step / 14), 0, Math.PI * 2)
          ctx.fill()
        }
      }
      break
    case 'diagonal':
      ctx.lineWidth = step / 3
      for (let x = -h; x < w + h; x += step) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x + h, h)
        ctx.stroke()
      }
      break
    case 'rays': {
      const rays = Math.max(8, Math.round(step))
      ctx.globalAlpha = 0.5
      for (let i = 0; i < rays; i += 2) {
        const a0 = (i / rays) * Math.PI * 2
        const a1 = ((i + 1) / rays) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(w / 2, h / 2)
        ctx.arc(w / 2, h / 2, Math.hypot(w, h), a0, a1)
        ctx.closePath()
        ctx.fill()
      }
      break
    }
    case 'noise': {
      ctx.globalAlpha = 0.12
      for (let i = 0; i < (w * h) / 900; i++) {
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2)
      }
      break
    }
  }
  ctx.restore()
}

function drawBackground(ctx: Ctx, project: Project): void {
  const { width: w, height: h } = project
  const bg = project.background
  ctx.save()
  switch (bg.kind) {
    case 'solid':
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, w, h)
      break
    case 'gradient':
      ctx.fillStyle = gradientFor(ctx, bg, w, h)
      ctx.fillRect(0, 0, w, h)
      break
    case 'pattern':
      drawPattern(ctx, bg, w, h)
      break
    case 'image': {
      const asset = getLoadedAsset(bg.assetId)
      ctx.fillStyle = bg.color
      ctx.fillRect(0, 0, w, h)
      if (asset) {
        const scale = Math.max(w / asset.width, h / asset.height)
        const dw = asset.width * scale
        const dh = asset.height * scale
        ctx.save()
        if (bg.imageBlur > 0) {
          ctx.filter = `blur(${(bg.imageBlur / 100) * 40}px)`
          // Overdraw slightly so the blur does not reveal the canvas edge.
          ctx.drawImage(asset.bitmap, (w - dw) / 2 - 40, (h - dh) / 2 - 40, dw + 80, dh + 80)
        } else {
          ctx.drawImage(asset.bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh)
        }
        ctx.restore()
      }
      if (bg.imageDim > 0) {
        ctx.fillStyle = `rgba(0,0,0,${bg.imageDim / 100})`
        ctx.fillRect(0, 0, w, h)
      }
      break
    }
  }
  ctx.restore()
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export function drawObject(ctx: Ctx, obj: SceneObject, scale: number): void {
  if (obj.hidden) return
  const raster = getRaster(obj, scale)
  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, obj.opacity / 100))
  ctx.translate(obj.x + obj.width / 2, obj.y + obj.height / 2)
  if (obj.rotation) ctx.rotate((obj.rotation * Math.PI) / 180)
  ctx.drawImage(
    raster.canvas,
    -obj.width / 2 - raster.pad,
    -obj.height / 2 - raster.pad,
    raster.canvas.width / scale,
    raster.canvas.height / scale,
  )
  ctx.restore()
}

export interface RenderOptions {
  /** Canvas pixels per project unit. */
  scale: number
  transparentBackground?: boolean
}

export function renderProject(ctx: Ctx, project: Project, options: RenderOptions): void {
  const { scale } = options
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.scale(scale, scale)
  if (!options.transparentBackground) drawBackground(ctx, project)
  for (const obj of project.objects) drawObject(ctx, obj, scale)
  ctx.restore()
}

/** Off-screen render at an arbitrary scale — used by export and thumbnails. */
export function renderToCanvas(project: Project, scale: number, transparentBackground = false): HTMLCanvasElement {
  const canvas = createCanvas(project.width * scale, project.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  renderProject(ctx, project, { scale, transparentBackground })
  return canvas
}

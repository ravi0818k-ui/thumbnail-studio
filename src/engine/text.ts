import type { TextObject } from '../types'
import { fontStack } from '../data/fonts'

/** Ink extent above and below the alphabetic baseline, in pixels. */
export interface TextInk {
  ascent: number
  descent: number
}

export interface TextLayout {
  lines: string[]
  lineHeight: number
  totalHeight: number
  maxWidth: number
  ink: TextInk
}

/**
 * Where the ink and the highlight plate sit inside one line box.
 *
 * `textBaseline: 'middle'` centres the font's whole ascent + descent box, which
 * for a display face like Anton is ~1.3 em — taller than a 1.0–1.05 line box.
 * Uppercase text has no descenders, so that reserved space shoves the caps to
 * the top of the line and out of the plate. Measuring the real ink and placing
 * an alphabetic baseline ourselves makes the result font-independent.
 */
export function lineGeometry(lineHeight: number, ink: TextInk, padding: number) {
  const inkHeight = ink.ascent + ink.descent
  const inkTop = (lineHeight - inkHeight) / 2
  return {
    inkTop,
    /** Baseline offset from the top of the line box. */
    baseline: inkTop + ink.ascent,
    plateTop: inkTop - padding,
    plateHeight: inkHeight + padding * 2,
  }
}

const FALLBACK_ASCENT = 0.76
const FALLBACK_DESCENT = 0.22

/** Ink box of the tallest line, so every line in one layer shares a plate size. */
export function measureInk(ctx: Ctx, obj: TextObject, lines: string[]): TextInk {
  applyTextFont(ctx, obj)
  let ascent = 0
  let descent = 0
  for (const line of lines) {
    if (!line) continue
    const metrics = ctx.measureText(line)
    const lineAscent = metrics.actualBoundingBoxAscent || metrics.fontBoundingBoxAscent || 0
    const lineDescent = metrics.actualBoundingBoxDescent || metrics.fontBoundingBoxDescent || 0
    ascent = Math.max(ascent, lineAscent)
    descent = Math.max(descent, lineDescent)
  }
  if (ascent <= 0) ascent = obj.fontSize * FALLBACK_ASCENT
  if (descent <= 0) descent = obj.fontSize * (obj.uppercase ? 0.02 : FALLBACK_DESCENT)
  return { ascent, descent }
}

export function fallbackInk(obj: TextObject): TextInk {
  return {
    ascent: obj.fontSize * FALLBACK_ASCENT,
    descent: obj.fontSize * (obj.uppercase ? 0.02 : FALLBACK_DESCENT),
  }
}

type Ctx = CanvasRenderingContext2D

const supportsLetterSpacing = (() => {
  try {
    const c = document.createElement('canvas').getContext('2d')
    return c !== null && 'letterSpacing' in c
  } catch {
    return false
  }
})()

export function fontString(obj: Pick<TextObject, 'italic' | 'fontWeight' | 'fontSize' | 'fontFamily'>): string {
  return `${obj.italic ? 'italic ' : ''}${obj.fontWeight} ${obj.fontSize}px ${fontStack(obj.fontFamily)}`
}

export function applyTextFont(ctx: Ctx, obj: TextObject): void {
  ctx.font = fontString(obj)
  if (supportsLetterSpacing) {
    ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${obj.letterSpacing}px`
  }
}

export function measureLine(ctx: Ctx, text: string, letterSpacing: number): number {
  if (supportsLetterSpacing) return ctx.measureText(text).width
  if (!text) return 0
  let w = 0
  for (const ch of text) w += ctx.measureText(ch).width + letterSpacing
  return w - letterSpacing
}

export function drawLine(ctx: Ctx, text: string, x: number, y: number, letterSpacing: number, mode: 'fill' | 'stroke'): void {
  if (supportsLetterSpacing || letterSpacing === 0) {
    if (mode === 'fill') ctx.fillText(text, x, y)
    else ctx.strokeText(text, x, y)
    return
  }
  // Manual tracking for engines without ctx.letterSpacing.
  const align = ctx.textAlign
  const total = measureLine(ctx, text, letterSpacing)
  let cursor = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  ctx.textAlign = 'left'
  for (const ch of text) {
    if (mode === 'fill') ctx.fillText(ch, cursor, y)
    else ctx.strokeText(ch, cursor, y)
    cursor += ctx.measureText(ch).width + letterSpacing
  }
  ctx.textAlign = align
}

export function getDisplayText(obj: TextObject): string {
  return obj.uppercase ? obj.text.toUpperCase() : obj.text
}

/** Greedy word wrap to the object's box width, honouring explicit newlines. */
export function layoutText(ctx: Ctx, obj: TextObject): TextLayout {
  applyTextFont(ctx, obj)
  const source = getDisplayText(obj)
  const lines: string[] = []
  if (obj.noWrap) {
    // Explicit line breaks only — the creator decides where lines end.
    for (const paragraph of source.split('\n')) lines.push(paragraph)
    return finishLayout(ctx, obj, lines)
  }
  for (const paragraph of source.split('\n')) {
    if (!paragraph) {
      lines.push('')
      continue
    }
    const words = paragraph.split(/(\s+)/).filter((w) => w !== '')
    let current = ''
    for (const word of words) {
      const candidate = current + word
      if (measureLine(ctx, candidate.trimEnd(), obj.letterSpacing) <= obj.width || current === '') {
        current = candidate
      } else {
        lines.push(current.trimEnd())
        current = word.trimStart()
      }
    }
    lines.push(current.trimEnd())
  }
  return finishLayout(ctx, obj, lines)
}

function finishLayout(ctx: Ctx, obj: TextObject, lines: string[]): TextLayout {
  const lineHeight = obj.fontSize * obj.lineHeight
  const maxWidth = lines.reduce((m, l) => Math.max(m, measureLine(ctx, l, obj.letterSpacing)), 0)
  const ink = measureInk(ctx, obj, lines)
  return { lines, lineHeight, maxWidth, ink, totalHeight: contentHeight(lines.length, lineHeight, ink, obj) }
}

/**
 * Height the lines occupy. A tight line height can leave the plate taller than
 * the line box, so the first and last lines reserve whichever is bigger.
 */
export function contentHeight(lineCount: number, lineHeight: number, ink: TextInk, obj: TextObject): number {
  const padding = obj.bgEnabled ? obj.bgPadding : 0
  const block = ink.ascent + ink.descent + padding * 2
  return Math.max(0, lineCount - 1) * lineHeight + Math.max(lineHeight, block)
}

let scratch: Ctx | null = null
export function scratchCtx(): Ctx | null {
  if (typeof document === 'undefined') return null
  if (!scratch) scratch = document.createElement('canvas').getContext('2d')
  return scratch
}

/** Height the box needs so no line is clipped. */
export function measuredTextHeight(obj: TextObject): number {
  const pad = obj.bgEnabled ? obj.bgPadding * 2 : 0
  const ctx = scratchCtx()
  if (!ctx) {
    // No canvas to measure with (tests, workers): fall back to explicit lines.
    const lines = Math.max(1, getDisplayText(obj).split('\n').length)
    return Math.ceil(contentHeight(lines, obj.fontSize * obj.lineHeight, fallbackInk(obj), obj) + pad)
  }
  const { totalHeight } = layoutText(ctx, obj)
  return Math.ceil(totalHeight + pad)
}

/**
 * Extra offscreen padding a text layer needs so the plate and ink are never
 * clipped by the raster bounds when the line height is tighter than the ink.
 */
export function textRasterPadding(obj: TextObject): number {
  const ctx = scratchCtx()
  const ink = ctx ? measureInk(ctx, obj, layoutText(ctx, obj).lines) : fallbackInk(obj)
  const geometry = lineGeometry(obj.fontSize * obj.lineHeight, ink, obj.bgEnabled ? obj.bgPadding : 0)
  return Math.ceil(Math.max(0, -geometry.plateTop))
}

export const AUTO_FIT_RANGE = { min: 8, max: 400 }

/**
 * Largest font size at which the text still fits its box (spec §11):
 * 'width' only constrains the line width, 'box' constrains both axes.
 * Binary search over the real layout, so wrapping is accounted for.
 */
export function fitFontSize(obj: TextObject): number {
  const ctx = scratchCtx()
  const pad = obj.bgEnabled ? obj.bgPadding * 2 : 0
  const availableWidth = Math.max(1, obj.width - pad)
  const availableHeight = Math.max(1, obj.height - pad)
  if (!ctx) {
    // Without a canvas to measure, estimate from the longest explicit line.
    const longest = Math.max(1, ...getDisplayText(obj).split('\n').map((l) => l.length))
    const lines = getDisplayText(obj).split('\n').length
    const byWidth = availableWidth / (longest * 0.52)
    const byHeight = availableHeight / (lines * obj.lineHeight)
    const estimate = obj.autoFit === 'box' ? Math.min(byWidth, byHeight) : byWidth
    return clampSize(estimate)
  }

  const fits = (size: number): boolean => {
    const probe = { ...obj, fontSize: size }
    const layout = layoutText(ctx, probe)
    if (layout.maxWidth > availableWidth) return false
    if (obj.autoFit === 'box' && layout.totalHeight > availableHeight) return false
    return true
  }

  let low = AUTO_FIT_RANGE.min
  let high = AUTO_FIT_RANGE.max
  if (fits(high)) return high
  // 12 halvings resolve the range to well under a pixel.
  for (let i = 0; i < 12; i++) {
    const mid = (low + high) / 2
    if (fits(mid)) low = mid
    else high = mid
  }
  return clampSize(low)
}

function clampSize(size: number): number {
  return Math.max(AUTO_FIT_RANGE.min, Math.min(AUTO_FIT_RANGE.max, Math.floor(size)))
}

/** Applies auto-fit and auto-height, returning only the fields that change. */
export function autoSizePatch(obj: TextObject): Partial<TextObject> {
  const patch: Partial<TextObject> = {}
  let next = obj
  if (obj.autoFit !== 'off') {
    const fontSize = fitFontSize(obj)
    if (fontSize !== obj.fontSize) {
      patch.fontSize = fontSize
      next = { ...obj, fontSize }
    }
  }
  if (obj.autoHeight && next.autoFit !== 'box') {
    const height = measuredTextHeight(next)
    if (height !== obj.height) patch.height = height
  }
  return patch
}

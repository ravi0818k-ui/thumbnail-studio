import type { Project, SceneObject, TextObject } from '../types'
import { safeZoneRects } from '../data/formats'
import { boundingRect } from './geometry'

// ---------------------------------------------------------------------------
// Composition assistant (spec §34): a client-side rules engine, not AI. It
// reads the scene and reports what a viewer would struggle with on a phone.
// ---------------------------------------------------------------------------

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface DesignCheck {
  id: string
  label: string
  status: CheckStatus
  detail: string
}

export interface DesignReport {
  score: number
  checks: DesignCheck[]
}

const isText = (o: SceneObject): o is TextObject => o.type === 'text'

/**
 * Smallest headline that still reads on a phone, as a share of canvas height.
 * A Short fills the screen, so it can carry proportionally smaller text than a
 * thumbnail shown in a 168 px grid cell.
 */
function minHeadlineRatio(project: Project): number {
  return project.format === 'shorts' ? 0.045 : 0.1
}

export function analyzeDesign(project: Project): DesignReport {
  const checks: DesignCheck[] = []
  const visible = project.objects.filter((o) => !o.hidden)
  const texts = visible.filter(isText)
  const headline = texts.reduce<TextObject | null>((max, t) => (!max || t.fontSize > max.fontSize ? t : max), null)
  const { safe, warning } = safeZoneRects(project.safeZone, project.width, project.height)

  // Readable headline -------------------------------------------------------
  if (!headline) {
    checks.push({ id: 'headline', label: 'Text is readable', status: 'warn', detail: 'No text on the canvas yet.' })
  } else {
    const ratio = headline.fontSize / project.height
    const min = minHeadlineRatio(project)
    checks.push({
      id: 'headline',
      label: 'Text is readable',
      status: ratio >= min ? 'pass' : ratio >= min * 0.75 ? 'warn' : 'fail',
      detail:
        ratio >= min
          ? `Largest text is ${Math.round(ratio * 100)}% of the canvas height.`
          : `Largest text is only ${Math.round(ratio * 100)}% of the height — aim for ${Math.round(min * 100)}%+.`,
    })
  }

  // Inside the safe area ----------------------------------------------------
  const outside = visible.filter((o) => {
    if (o.type === 'image' && !o.assetId) return false
    const b = boundingRect([o])!
    return b.x < warning.x || b.y < warning.y || b.x + b.width > warning.x + warning.width || b.y + b.height > warning.y + warning.height
  })
  // Full-bleed photos and backdrops are meant to run to the edge.
  const offenders = outside.filter((o) => !isFullBleed(o, project))
  checks.push({
    id: 'safe-area',
    label: 'Content is inside the safe area',
    status: offenders.length === 0 ? 'pass' : offenders.some(isText) ? 'fail' : 'warn',
    detail:
      offenders.length === 0
        ? 'Nothing important sits under the interface.'
        : `Reaches into the covered area: ${offenders.map((o) => o.name).join(', ')}.`,
  })

  // Bottom crowding ---------------------------------------------------------
  const bottomLimit = safe.y + safe.height
  const low = texts.filter((t) => t.y + t.height > bottomLimit)
  checks.push({
    id: 'bottom',
    label: 'Text is clear of the bottom row',
    status: low.length === 0 ? 'pass' : 'warn',
    detail: low.length === 0 ? 'Bottom of the frame is clear.' : `Too close to the bottom: ${low.map((t) => t.name).join(', ')}.`,
  })

  // Clutter -----------------------------------------------------------------
  const wordCount = texts.reduce((sum, t) => sum + t.text.trim().split(/\s+/).filter(Boolean).length, 0)
  checks.push({
    id: 'clutter',
    label: 'Not too many elements',
    status: visible.length <= 14 ? 'pass' : visible.length <= 22 ? 'warn' : 'fail',
    detail: `${visible.length} layers, ${wordCount} words.`,
  })

  // Word budget -------------------------------------------------------------
  const budget = project.format === 'shorts' ? 10 : 12
  checks.push({
    id: 'words',
    label: 'Short, punchy copy',
    status: wordCount === 0 ? 'warn' : wordCount <= budget ? 'pass' : 'warn',
    detail: wordCount === 0 ? 'Add a headline.' : `${wordCount} words (aim for ${budget} or fewer).`,
  })

  // Contrast ----------------------------------------------------------------
  const contrast = contrastCheck(project, headline)
  if (contrast) checks.push(contrast)

  const weights: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0 }
  const score = Math.round((checks.reduce((sum, c) => sum + weights[c.status], 0) / Math.max(1, checks.length)) * 100)
  return { score, checks }
}

function isFullBleed(obj: SceneObject, project: Project): boolean {
  return obj.x <= 2 && obj.y <= 2 && obj.width >= project.width - 4 && obj.height >= project.height - 4
}

/** Rough luminance contrast between the headline and what sits behind it. */
function contrastCheck(project: Project, headline: TextObject | null): DesignCheck | null {
  if (!headline) return null
  const textLuma = luminance(headline.color)
  const behind = backdropColor(project, headline)
  if (textLuma === null || behind === null) {
    return { id: 'contrast', label: 'Good contrast', status: 'pass', detail: 'Headline sits on artwork — check it by eye.' }
  }
  const ratio = contrastRatio(textLuma, behind)
  // A stroke or plate does the separating when the colours are close.
  const separated = headline.strokeWidth >= 4 || headline.bgEnabled || headline.effects.shadow.enabled
  const status: CheckStatus = ratio >= 4.5 ? 'pass' : separated ? 'pass' : ratio >= 3 ? 'warn' : 'fail'
  return {
    id: 'contrast',
    label: 'Good contrast',
    status,
    detail:
      status === 'pass' && ratio < 4.5
        ? `Contrast is ${ratio.toFixed(1)}:1, carried by the stroke or shadow.`
        : `Headline contrast is ${ratio.toFixed(1)}:1 against the background.`,
  }
}

/** The colour immediately behind a layer: a plate, the background, or nothing. */
function backdropColor(project: Project, obj: TextObject): number | null {
  if (obj.bgEnabled) return luminance(obj.bgColor)
  const bg = project.background
  if (bg.kind === 'solid') return luminance(bg.color)
  if (bg.kind === 'gradient') {
    const from = luminance(bg.gradient.from)
    const to = luminance(bg.gradient.to)
    return from === null || to === null ? null : (from + to) / 2
  }
  if (bg.kind === 'pattern') return luminance(bg.pattern.background)
  return null
}

export function luminance(color: string): number | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(color.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}

export function contrastRatio(a: number, b: number): number {
  const light = Math.max(a, b)
  const dark = Math.min(a, b)
  return (light + 0.05) / (dark + 0.05)
}

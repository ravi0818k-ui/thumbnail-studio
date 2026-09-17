import type { ImageObject, Project, SceneObject, TextObject } from '../types'
import type { BrandPreset } from '../data/brands'
import { RANJAN_NOTES } from '../data/brand'
import { renderToCanvas } from './renderer'

// ---------------------------------------------------------------------------
// Grades a design against a brand preset. Every threshold comes from the preset
// (src/data/brands.ts), so a new channel is a data file — not a new rules file.
// Rules that can be measured are measured; the rest are listed as reminders.
// ---------------------------------------------------------------------------

export type QaStatus = 'pass' | 'warn' | 'fail' | 'manual'

export interface QaItem {
  id: string
  label: string
  status: QaStatus
  detail: string
}

/** Share of the canvas per palette role, plus everything off-palette. */
export type ColorShare = Record<string, number>

export function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function distance(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Nearest brand colour, or null when nothing is close enough. */
export function nearestRole(
  rgb: [number, number, number],
  preset: BrandPreset = RANJAN_NOTES,
  tolerance = 46,
): string | null {
  let best: { role: string; d: number } | null = null
  for (const color of preset.palette) {
    const target = hexToRgb(color.hex)
    if (!target) continue
    const d = distance(rgb, target)
    if (!best || d < best.d) best = { role: color.role, d }
  }
  return best && best.d <= tolerance ? best.role : null
}

function emptyShare(preset: BrandPreset): ColorShare {
  const share: ColorShare = { other: 0 }
  for (const color of preset.palette) share[color.role] = 0
  return share
}

/**
 * Percentage of the canvas each brand colour covers. Sampled from a real render
 * so it accounts for photos, gradients, shadows and overlaps — not just fills.
 */
export function sampleColorShare(project: Project, preset: BrandPreset = RANJAN_NOTES): ColorShare {
  const canvas = renderToCanvas(project, 200 / project.width)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  return shareFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, preset)
}

/** Buckets RGBA pixels into brand roles and returns percentages. */
export function shareFromPixels(data: Uint8ClampedArray, preset: BrandPreset = RANJAN_NOTES): ColorShare {
  const share = emptyShare(preset)
  const total = data.length / 4
  if (total === 0) return share
  for (let i = 0; i < data.length; i += 4) {
    const role = nearestRole([data[i], data[i + 1], data[i + 2]], preset)
    if (role) share[role] += 1
    else share.other += 1
  }
  for (const key of Object.keys(share)) share[key] = (share[key] / total) * 100
  return share
}

const isText = (o: SceneObject): o is TextObject => o.type === 'text'
const isImage = (o: SceneObject): o is ImageObject => o.type === 'image'

function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length
}

function range(value: number, [lo, hi]: [number, number]): QaStatus {
  return value >= lo && value <= hi ? 'pass' : 'warn'
}

/** Colours a design uses, for the palette-adherence check. */
export function usedColors(project: Project): string[] {
  const out = new Set<string>()
  const add = (value?: string | null) => {
    if (value && value !== 'transparent') out.add(value.toLowerCase())
  }
  const bg = project.background
  if (bg.kind === 'solid') add(bg.color)
  if (bg.kind === 'gradient') {
    add(bg.gradient.from)
    add(bg.gradient.to)
  }
  if (bg.kind === 'pattern') {
    add(bg.pattern.color)
    add(bg.pattern.background)
  }
  for (const obj of project.objects) {
    if (obj.hidden) continue
    if (obj.type === 'text') {
      add(obj.color)
      if (obj.strokeWidth > 0) add(obj.strokeColor)
      if (obj.bgEnabled) add(obj.bgColor)
    }
    if (obj.type === 'shape') {
      if (obj.fillEnabled) add(obj.fill)
      if (obj.strokeEnabled) add(obj.stroke)
    }
    if ('effects' in obj) {
      if (obj.effects.outline.enabled) add(obj.effects.outline.color)
      if (obj.effects.glow.enabled) add(obj.effects.glow.color)
      if (obj.effects.overlay.enabled) add(obj.effects.overlay.color)
    }
  }
  return [...out]
}

/**
 * Greys are structural (note rules, muted labels) and are not palette breaches.
 * Judged by saturation, so cool blue-greys like #C9D2DE still count as neutral.
 */
function isNeutral(rgb: [number, number, number]): boolean {
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  return max === 0 || (max - min) / max < 0.25
}

export function runBrandQa(
  project: Project,
  share: ColorShare | null,
  preset: BrandPreset = RANJAN_NOTES,
): QaItem[] {
  const items: QaItem[] = []
  const visible = project.objects.filter((o) => !o.hidden)
  const texts = visible.filter(isText)
  const images = visible.filter(isImage)
  const headline = texts.reduce<TextObject | null>((max, t) => (!max || t.fontSize > max.fontSize ? t : max), null)
  const hookStyle = preset.textStyles.find((s) => s.tier === 'L1')
  const minHeadline = hookStyle ? hookStyle.range[0] : 100

  // 1 — canvas ------------------------------------------------------------
  const sizeOk = project.width === preset.canvas.width && project.height === preset.canvas.height
  items.push({
    id: 'canvas',
    label: `${preset.canvas.width} × ${preset.canvas.height} px`,
    status: sizeOk ? 'pass' : 'fail',
    detail: sizeOk ? 'Exact 16:9 thumbnail size.' : `Currently ${project.width} × ${project.height}.`,
  })

  // 2 — headline size -----------------------------------------------------
  if (!headline) {
    items.push({ id: 'headline', label: 'Main title readable on mobile', status: 'fail', detail: 'No text on the canvas yet.' })
  } else {
    const status: QaStatus = headline.fontSize >= minHeadline ? 'pass' : headline.fontSize >= minHeadline * 0.8 ? 'warn' : 'fail'
    items.push({
      id: 'headline',
      label: 'Main title readable on mobile',
      status,
      detail:
        status === 'pass'
          ? `Largest text is ${headline.fontSize} px — reads at 168 px wide.`
          : `Largest text is ${headline.fontSize} px; the headline level starts at ${minHeadline} px.`,
    })
  }

  // 3 — word counts -------------------------------------------------------
  if (headline) {
    // The headline is a *band*, not a layer. Without per-word styling a
    // highlighted keyword has to be its own layer, so counting only the largest
    // layer reads "Stop" and misses "cramming" — and the rule is about the
    // sentence a viewer sees, not about how it happens to be split up.
    const band = texts.filter((t) => t.fontSize >= headline.fontSize * 0.85)
    const hookWords = band.reduce((sum, t) => sum + words(t.text), 0)
    items.push({
      id: 'title-words',
      label: `Headline is ${preset.rules.hookWords[0]}–${preset.rules.hookWords[1]} words`,
      status: range(hookWords, preset.rules.hookWords),
      detail:
        band.length > 1
          ? `Headline has ${hookWords} words across ${band.length} layers.`
          : `Headline has ${hookWords} word${hookWords === 1 ? '' : 's'}.`,
    })
  }
  const prominent = texts.filter((t) => t.fontSize >= 55).reduce((sum, t) => sum + words(t.text), 0)
  const idealWords = Math.max(3, Math.round(preset.rules.prominentWordsMax * 0.6))
  items.push({
    id: 'prominent-words',
    label: `Keep prominent copy under ${preset.rules.prominentWordsMax} words`,
    status: prominent <= idealWords ? 'pass' : prominent <= preset.rules.prominentWordsMax ? 'warn' : 'fail',
    detail:
      prominent <= idealWords
        ? `${prominent} words at 55 px or larger.`
        : `${prominent} words at 55 px or larger — ${prominent <= preset.rules.prominentWordsMax ? 'acceptable, but tighten it' : 'over the limit'}.`,
  })

  // 4 — one highlighted keyword -------------------------------------------
  if (preset.rules.highlights) {
    const highlighted = texts.filter((t) => t.bgEnabled && t.fontSize >= 55).length
    items.push({
      id: 'highlight',
      label:
        preset.rules.highlights[0] === preset.rules.highlights[1] && preset.rules.highlights[0] === 1
          ? 'Exactly one highlighted keyword'
          : `${preset.rules.highlights[0]}–${preset.rules.highlights[1]} highlighted keywords`,
      status: range(highlighted, preset.rules.highlights),
      detail:
        highlighted === 0
          ? 'Nothing is highlighted — put the key word on the accent block.'
          : `${highlighted} highlighted word${highlighted === 1 ? '' : 's'}.`,
    })
  }

  // 5 — breathing room ----------------------------------------------------
  const margin = preset.canvas.safeMargin
  const tight = texts.filter(
    (t) => t.x < margin - 4 || t.y < margin - 4 || t.x + t.width > project.width - margin + 4 || t.y + t.height > project.height - margin + 4,
  )
  items.push({
    id: 'margin',
    label: `${margin} px outer breathing room`,
    status: tight.length === 0 ? 'pass' : 'warn',
    detail: tight.length === 0 ? 'All text sits inside the safe area.' : `Too close to the edge: ${tight.map((t) => t.name).join(', ')}.`,
  })

  // 6 — layout split ------------------------------------------------------
  if (preset.rules.subject) {
    const { side, share: subjectShare } = preset.rules.subject
    const placed = images.filter((o) => o.assetId || o.name.toLowerCase().includes('creator'))
    const boundary = side === 'right' ? project.width * (1 - subjectShare) : project.width * subjectShare
    const wrongSide = placed.filter((o) => {
      const centre = o.x + o.width / 2
      // A full-bleed photo is a background, not the subject.
      if (o.width >= project.width * 0.9) return false
      return side === 'right' ? centre < boundary : centre > boundary
    })
    const textInSubjectZone = texts.filter((t) =>
      side === 'right' ? t.x > boundary + 8 : t.x + t.width < boundary - 8,
    )
    const offenders = [...wrongSide, ...textInSubjectZone]
    items.push({
      id: 'layout',
      label: `Copy ${Math.round((1 - subjectShare) * 100)}% / subject ${Math.round(subjectShare * 100)}% on the ${side}`,
      status: offenders.length === 0 ? 'pass' : 'warn',
      detail:
        offenders.length === 0
          ? `Split follows the guide.`
          : `Crossing the split: ${offenders.map((o) => o.name).join(', ')}.`,
    })
  }

  // 7 — palette -----------------------------------------------------------
  const offPalette = usedColors(project).filter((hex) => {
    const rgb = hexToRgb(hex)
    if (!rgb) return false
    if (isNeutral(rgb)) return false
    return nearestRole(rgb, preset) === null
  })
  items.push({
    id: 'palette',
    label: 'Brand palette only',
    status: offPalette.length === 0 ? 'pass' : 'warn',
    detail: offPalette.length === 0 ? 'Every colour is on brand.' : `Off-palette: ${offPalette.join(', ')}.`,
  })

  // 8 — colour budget -----------------------------------------------------
  if (share) {
    const ground = preset.ground.roles.reduce((sum, role) => sum + (share[role] ?? 0), 0)
    items.push({
      id: 'ground',
      label: `${preset.ground.label} ${preset.ground.budget[0]}–${preset.ground.budget[1]}%`,
      status: range(ground, preset.ground.budget),
      detail: `${ground.toFixed(0)}% of the canvas.`,
    })
    for (const color of preset.palette) {
      if (!color.budget || preset.ground.roles.includes(color.role)) continue
      const value = share[color.role] ?? 0
      items.push({
        id: `budget:${color.role}`,
        label: `${color.name} ${color.budget[0]}–${color.budget[1]}%`,
        status: range(value, color.budget),
        detail: `${value.toFixed(0)}% of the canvas.`,
      })
    }
    const accentRoles = preset.palette.filter((c) => /red|green|alert/i.test(c.role)).map((c) => c.role)
    const accents = accentRoles.reduce((sum, role) => sum + (share[role] ?? 0), 0)
    items.push({
      id: 'accents',
      label: 'Alert colours stay accents',
      status: accents <= preset.rules.accentBudget ? 'pass' : 'warn',
      detail: `${accents.toFixed(1)}% across ${accentRoles.join(' + ') || 'none'}.`,
    })
  }

  // 9 — cut-out treatment -------------------------------------------------
  const withPhoto = images.filter((o) => o.assetId)
  if (withPhoto.length > 0) {
    if (preset.cutout.requireOutline) {
      const [lo, hi] = preset.cutout.outlineRange
      const bad = withPhoto.filter((o) => {
        const outline = o.effects.outline
        return !outline.enabled || outline.width < lo || outline.width > hi
      })
      items.push({
        id: 'outline',
        label: `Clean ${lo}–${hi} px subject outline`,
        status: bad.length === 0 ? 'pass' : 'warn',
        detail: bad.length === 0 ? 'Cut-outs carry the brand outline.' : `Missing or out of range on: ${bad.map((o) => o.name).join(', ')}.`,
      })
    }
    if (preset.cutout.requireCutout === false) {
      // A full-bleed brand wants the photograph whole; asking for a cut-out
      // here would be advice against its own style guide.
      items.push({
        id: 'cutout',
        label: 'Full-bleed photography',
        status: 'pass',
        detail: 'This brand frames the photo rather than cutting the subject out.',
      })
    } else {
      const noCutout = withPhoto.filter((o) => !o.cutoutAssetId)
      items.push({
        id: 'cutout',
        label: 'Subject background removed',
        status: noCutout.length === 0 ? 'pass' : 'warn',
        detail: noCutout.length === 0 ? 'All photos are cut out.' : `Still rectangular: ${noCutout.map((o) => o.name).join(', ')}.`,
      })
    }
  } else {
    items.push({
      id: 'cutout',
      label: 'Subject background removed',
      status: 'manual',
      detail: images.length > 0 ? 'Photo slots are still empty.' : 'No creator photo on this thumbnail.',
    })
  }

  // 10 — shadow discipline ------------------------------------------------
  const heavy = visible.filter((o) => {
    if (!('effects' in o)) return false
    const { shadow, glow } = o.effects
    return glow.enabled || (shadow.enabled && (shadow.opacity > 45 || shadow.blur > 40))
  })
  items.push({
    id: 'shadows',
    label: 'Shadows subtle, no glow',
    status: heavy.length === 0 ? 'pass' : 'warn',
    detail: heavy.length === 0 ? 'Shadows stay within the spec.' : `Too heavy or glowing: ${heavy.map((o) => o.name).join(', ')}.`,
  })

  // 11 — clutter ----------------------------------------------------------
  items.push({
    id: 'clutter',
    label: 'One main visual idea',
    status: visible.length <= preset.rules.maxLayers ? 'pass' : 'warn',
    detail: `${visible.length} visible layers.`,
  })

  // 12 — human judgement --------------------------------------------------
  preset.checklist.forEach((label, index) => {
    items.push({ id: `manual:${index}`, label, status: 'manual', detail: 'Check it by eye in Preview.' })
  })

  return items
}

export function qaScore(items: QaItem[]): { passed: number; checked: number } {
  const checked = items.filter((i) => i.status !== 'manual')
  return { passed: checked.filter((i) => i.status === 'pass').length, checked: checked.length }
}

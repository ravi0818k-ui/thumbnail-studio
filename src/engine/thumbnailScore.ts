import type { Project, TextObject } from '../types'
import { boundingRect } from './geometry'
import { safeZoneRects } from '../data/formats'

// ---------------------------------------------------------------------------
// Thumbnail scoring. The measurements are made in Python over the rendered
// pixels (src/python/score.py); everything here is the half that has to be
// written by a person: what each number is called, and what to do about it.
//
// The design deliberately keeps those apart. Python returns ids, scores and raw
// values and knows nothing about English; this module turns them into advice.
//
// Nothing here touches the worker, so all of it is exercised headlessly by the
// selftest. `runScore.ts` is the part that actually renders and calls Python.
// ---------------------------------------------------------------------------

export type MetricId = 'text' | 'detail' | 'focus' | 'palette' | 'range' | 'sharpness' | 'occlusion'

export interface RawMetric {
  id: MetricId
  score: number | null
  value: number | null
}

export interface RawPlatform {
  id: 'desktop' | 'mobile'
  width: number
  score: number
  focus: { x: number; y: number }
  metrics: RawMetric[]
}

export interface RawReport {
  width: number
  height: number
  palette: { hex: string; share: number }[]
  platforms: RawPlatform[]
}

export interface MetricInfo {
  label: string
  /** What the measurement means, in one line. */
  about: string
  /** Turns the raw measurement into a sentence. */
  read: (value: number) => string
  /** What to do when the score is poor. */
  fix: string
}

export const METRIC_INFO: Record<MetricId, MetricInfo> = {
  text: {
    label: 'Text contrast',
    about: 'Contrast between your words and whatever sits directly behind them, measured at this size.',
    read: (v) => `${v.toFixed(1)}:1 at the weakest text layer`,
    fix: 'Add a plate behind the text, an outline, or move it over a plainer part of the picture. 4.5:1 is the floor; strong thumbnails run past 7:1.',
  },
  detail: {
    label: 'Survives shrinking',
    about: 'How much of the design is still there after it is scaled down to this width and back.',
    read: (v) => `${(v * 100).toFixed(1)}% of the picture changes when it is shrunk`,
    fix: 'Fewer, bigger elements. Thin strokes, small type and fine texture are the first things to disappear.',
  },
  focus: {
    label: 'Focal clarity',
    about: 'How much of the frame it takes to hold half the attention. One subject needs very little.',
    read: (v) => `half the attention is spread over ${(v * 100).toFixed(0)}% of the frame`,
    fix: 'Cut elements, or push one subject forward with size, contrast or a background blur. Two deliberate zones are fine; five are not.',
  },
  palette: {
    label: 'Colour hierarchy',
    about: 'Whether one colour leads and the rest support, rather than several competing equally.',
    read: (v) => `the dominant colour covers ${(v * 100).toFixed(0)}% of the frame`,
    fix: 'Pick one background colour and one accent. A flat single-colour wash and a confetti of equal colours both read badly at small sizes.',
  },
  range: {
    label: 'Tonal range',
    about: 'The spread between the near-darkest and near-brightest parts of the design.',
    read: (v) => `${(v * 100).toFixed(0)}% of the available range is used`,
    fix: 'Darken the background or brighten the subject. A mid-grey design disappears against both light and dark interfaces.',
  },
  sharpness: {
    label: 'Sharpness',
    about: 'Edge energy in the rendered design — low means a soft or upscaled source.',
    read: (v) => `edge energy ${(v * 1000).toFixed(0)}`,
    fix: 'Use a larger source image, or run Sharpen or Upscale in Enhance quality.',
  },
  occlusion: {
    label: 'Clear of the interface',
    about: "How much of the attention falls where YouTube draws its own controls over the thumbnail.",
    read: (v) => `${(v * 100).toFixed(0)}% of the attention sits under the interface`,
    fix: 'Move the subject or the headline inside the safe area. Turn on the safe-zone overlay to see exactly where it is.',
  },
}

export const PLATFORM_INFO: Record<string, { label: string; about: string }> = {
  desktop: {
    label: 'Desktop',
    about: 'Judged at 360 px — the home-page grid.',
  },
  mobile: {
    label: 'Mobile',
    about: 'Judged at 168 px. A 360 px card on a phone covers about the same angle as a 168 px card on a monitor, so this is the honest phone simulation, not a pessimistic one.',
  },
}

export type Verdict = 'good' | 'fair' | 'poor'

export function verdict(score: number): Verdict {
  if (score >= 75) return 'good'
  if (score >= 50) return 'fair'
  return 'poor'
}

/**
 * Text layers as normalised boxes. Rotation is taken into account through the
 * bounding rect, so a tilted headline still hands over the area it occupies.
 */
export function textRegions(project: Project): number[][] {
  return project.objects
    .filter((o): o is TextObject => o.type === 'text' && !o.hidden && o.text.trim().length > 0)
    .map((o) => boundingRect([o]))
    .filter((box): box is NonNullable<typeof box> => box !== null && box.width > 0 && box.height > 0)
    .map((box) => clampRect(box.x / project.width, box.y / project.height, box.width / project.width, box.height / project.height))
    .filter((r) => r[2] > 0 && r[3] > 0)
}

/** A layer can hang off the canvas; only the part on it can be measured. */
function clampRect(x: number, y: number, w: number, h: number): number[] {
  const x0 = Math.max(0, Math.min(1, x))
  const y0 = Math.max(0, Math.min(1, y))
  const x1 = Math.max(0, Math.min(1, x + w))
  const y1 = Math.max(0, Math.min(1, y + h))
  return [x0, y0, x1 - x0, y1 - y0]
}

/**
 * The bands the host interface covers, per platform, taken from the project's
 * own safe zone so this never becomes a second set of magic numbers. Mobile is
 * given the bottom band as well: that is where the progress bar and, on Shorts,
 * the whole caption stack sit.
 */
export function occlusionRects(project: Project): Record<string, number[][]> {
  const { safe } = safeZoneRects(project.safeZone, project.width, project.height)
  const x = safe.x / project.width
  const y = safe.y / project.height
  const w = safe.width / project.width
  const h = safe.height / project.height

  const bands: number[][] = []
  if (y > 0.001) bands.push([0, 0, 1, y])
  if (y + h < 0.999) bands.push([0, y + h, 1, 1 - (y + h)])
  if (x > 0.001) bands.push([0, 0, x, 1])
  if (x + w < 0.999) bands.push([x + w, 0, 1 - (x + w), 1])

  // Every surface stamps the duration over the bottom-right corner.
  const duration = [0.78, 0.86, 0.22, 0.14]
  return { desktop: [...bands, duration], mobile: [...bands, duration] }
}

/** The weakest metric on a platform, which is the one worth acting on. */
export function weakest(platform: RawPlatform): RawMetric | null {
  const scored = platform.metrics.filter((m) => m.score !== null)
  if (scored.length === 0) return null
  return scored.reduce((low, m) => ((m.score as number) < (low.score as number) ? m : low))
}

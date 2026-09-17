import type { Adjustments, Background, CanvasFormat, Effects, ShapeObject, TextObject } from '../types'
import { RANJAN_NOTES } from './brand'
import { SUPER_LEARNER } from './superLearner'
import { JUSTIN_SUNG } from './justinSung'
import { VIVIAN } from './vivian'

// ---------------------------------------------------------------------------
// Master presets. A brand is data: palette, type scale, element vocabulary,
// photo treatment and the rules its thumbnails must satisfy. The Brand panel,
// the apply helpers and the QA engine are all driven by this shape, so adding a
// channel is adding a file here — never a second panel.
// ---------------------------------------------------------------------------

export interface BrandColor {
  /** Stable id inside the preset, used by budgets and the colour sampler. */
  role: string
  name: string
  hex: string
  use: string
  /** Share of the canvas this colour should cover, in percent. */
  budget?: [number, number]
}

export type TextTier = 'L1' | 'L2' | 'L3' | 'L4' | 'note'

export interface BrandTextStyle {
  id: string
  label: string
  tier: TextTier
  /** Human-readable size band from the guide. */
  hint: string
  /** Size range the QA panel checks against. */
  range: [number, number]
  apply: Partial<TextObject>
}

export interface BrandElementStyle {
  id: string
  label: string
  hint: string
  /** Default footprint as a fraction of canvas width / height. */
  size: [number, number]
  apply: Partial<ShapeObject>
}

export interface BrandBackground {
  id: string
  label: string
  value: Background
}

export interface BrandRules {
  /** Words allowed in the headline. */
  hookWords: [number, number]
  /** Total words at headline-ish size before it reads as a paragraph. */
  prominentWordsMax: number
  /** How many keywords may carry a highlight plate. */
  highlights?: [number, number]
  /** Where the creator photo belongs, as a share of the canvas width. */
  subject?: { side: 'left' | 'right'; share: number }
  /** Combined share for the alert colours before they stop being accents. */
  accentBudget: number
  maxLayers: number
}

export interface BrandPreset {
  id: string
  name: string
  tagline?: string
  motto?: string
  description: string
  format: CanvasFormat
  canvas: { width: number; height: number; safeMargin: number }
  palette: BrandColor[]
  /** The colour or colours that should dominate — light for a light brand, ink for a dark one. */
  ground: { label: string; roles: string[]; budget: [number, number] }
  fonts: { headline: string; supporting: string; accent?: string }
  textStyles: BrandTextStyle[]
  elementStyles: BrandElementStyle[]
  backgrounds: BrandBackground[]
  cutout: {
    effects: Effects
    outlineRange: [number, number]
    requireOutline: boolean
    /**
     * False for brands built on full-bleed photography, where the subject is
     * the frame rather than a cut-out and QA must not ask for one.
     */
    requireCutout?: boolean
  }
  photoAdjustments: Adjustments
  rules: BrandRules
  /** Reminders the rules engine cannot check, shown as manual QA items. */
  checklist: string[]
  /** Licence note shown in the panel, e.g. for free icon sets. */
  attribution?: string
  /** An empty image slot the layouts drop in for a flat icon. */
  iconSlot?: { label: string; share: number }
}

export const BRAND_PRESETS: BrandPreset[] = [SUPER_LEARNER, RANJAN_NOTES, JUSTIN_SUNG, VIVIAN]

export const DEFAULT_BRAND_ID = SUPER_LEARNER.id

export function brandPreset(id: string | null | undefined): BrandPreset {
  return BRAND_PRESETS.find((b) => b.id === id) ?? BRAND_PRESETS[0]
}

export function colorByRole(preset: BrandPreset, role: string): string {
  return preset.palette.find((c) => c.role === role)?.hex ?? '#000000'
}

export function textStyle(preset: BrandPreset, id: string): BrandTextStyle | undefined {
  return preset.textStyles.find((s) => s.id === id)
}

export function elementStyle(preset: BrandPreset, id: string): BrandElementStyle | undefined {
  return preset.elementStyles.find((e) => e.id === id)
}

import type { Adjustments, Effects } from '../types'
import { DEFAULT_ADJUSTMENTS, DEFAULT_BACKGROUND, DEFAULT_EFFECTS } from '../types'
import type { BrandBackground, BrandElementStyle, BrandPreset, BrandTextStyle } from './brands'

// ---------------------------------------------------------------------------
// Brand 1 — "Simple design. Big impact."
//
// Encoded from the channel's thumbnail style guide: a dark, high-contrast,
// two-font system where one yellow-highlighted keyword carries the hook, the
// copy occupies the left 60% and the creator plus a single flat icon occupy the
// right 40%.
// ---------------------------------------------------------------------------

export const INK = '#181A1F'
export const LIGHT = '#F5F5F0'
export const YELLOW = '#FFD43B'
export const BLUE = '#4DA3FF'
export const RED = '#FF4D4D'
export const MUTED = '#9CA3AF'

export const CANVAS = { width: 1280, height: 720, safeMargin: 56 }

/** The guide's split: copy on the left, creator and icon on the right. */
export const LAYOUT = { textShare: 0.6, subjectShare: 0.4 }

function effects(over: Partial<Effects> = {}): Effects {
  return {
    shadow: { ...DEFAULT_EFFECTS.shadow, ...over.shadow },
    outline: { ...DEFAULT_EFFECTS.outline, ...over.outline },
    glow: { ...DEFAULT_EFFECTS.glow, ...over.glow },
    overlay: { ...DEFAULT_EFFECTS.overlay, ...over.overlay },
  }
}

/** Soft separation for text sitting over artwork; never a glow. */
const TEXT_SHADOW = { enabled: true, color: '#000000', opacity: 22, offsetX: 0, offsetY: 6, blur: 14 }
const LIFT_SHADOW = { enabled: true, color: '#000000', opacity: 30, offsetX: 0, offsetY: 8, blur: 18 }

const HEADLINE = 'Anton'
const SUPPORTING = 'Inter'

const TEXT_STYLES: BrandTextStyle[] = [
  {
    id: 'hook',
    label: 'Headline',
    tier: 'L1',
    hint: '110–160 px · 2–4 main words',
    range: [110, 160],
    apply: {
      fontFamily: HEADLINE,
      fontWeight: 400,
      fontSize: 132,
      color: LIGHT,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.02,
      letterSpacing: 0,
      align: 'left',
      bgEnabled: false,
      effects: effects({ shadow: TEXT_SHADOW }),
    },
  },
  {
    id: 'keyword',
    label: 'Highlighted keyword',
    tier: 'L1',
    hint: 'Ink on the yellow block — exactly one per thumbnail',
    range: [110, 160],
    apply: {
      fontFamily: HEADLINE,
      fontWeight: 400,
      fontSize: 132,
      color: INK,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.02,
      align: 'left',
      bgEnabled: true,
      bgColor: YELLOW,
      bgPadding: 18,
      bgRadius: 6,
      effects: effects(),
    },
  },
  {
    id: 'hook-light',
    label: 'Headline on light',
    tier: 'L1',
    hint: 'Ink headline for the light-mode variant',
    range: [110, 160],
    apply: {
      fontFamily: HEADLINE,
      fontWeight: 400,
      fontSize: 132,
      color: INK,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.02,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'subhead',
    label: 'Subheadline',
    tier: 'L2',
    hint: '52–80 px · one supporting line',
    range: [52, 80],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 900,
      fontSize: 64,
      color: LIGHT,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.1,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'support',
    label: 'Supporting text',
    tier: 'L3',
    hint: '34–48 px · keep it to one idea',
    range: [34, 48],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 600,
      fontSize: 40,
      color: MUTED,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.25,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'meta',
    label: 'Tracked meta line',
    tier: 'L4',
    hint: '24–34 px · the SCIENCE | REASONS | SOLUTIONS line',
    range: [24, 34],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 700,
      fontSize: 30,
      color: MUTED,
      strokeWidth: 0,
      uppercase: true,
      letterSpacing: 8,
      lineHeight: 1.2,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'alert',
    label: 'Alert line',
    tier: 'L2',
    hint: '48–72 px · warnings and mistakes, used sparingly',
    range: [48, 72],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 900,
      fontSize: 60,
      color: RED,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.1,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'note',
    label: 'Sticky note',
    tier: 'note',
    hint: '30–48 px · the handwritten aside from the reference art',
    range: [30, 48],
    apply: {
      fontFamily: 'Caveat',
      fontWeight: 700,
      fontSize: 40,
      color: INK,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.05,
      align: 'center',
      bgEnabled: false,
      effects: effects(),
    },
  },
]

/** Hand-drawn accents, authored in a 100 × 100 box like the element library. */
export const PATHS = {
  arrowCurved: 'M2 96 C6 54 34 22 72 16 L64 2 L98 22 L66 44 L68 30 C40 36 20 62 16 96 Z',
  spark: 'M46 2 L58 2 L54 32 L44 32 Z M2 32 L12 22 L34 44 L26 54 Z M98 26 L88 16 L64 40 L72 48 Z',
  underline: 'M2 34 L98 30 L98 62 L2 66 Z',
} as const

const ELEMENT_STYLES: BrandElementStyle[] = [
  {
    id: 'highlight',
    label: 'Highlight block',
    hint: 'Yellow block behind a keyword, square-ish corners',
    size: [0.26, 0.17],
    apply: {
      shape: 'roundRect',
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 6,
      effects: effects(),
    },
  },
  {
    id: 'note',
    label: 'Sticky note',
    hint: 'Tilted yellow note for a short aside',
    size: [0.14, 0.14],
    apply: {
      shape: 'roundRect',
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 8,
      rotation: -8,
      effects: effects({ shadow: LIFT_SHADOW }),
    },
  },
  {
    id: 'arrow',
    label: 'Curved arrow',
    hint: 'Points the eye from the copy to the icon',
    size: [0.1, 0.16],
    apply: {
      shape: 'path',
      pathData: PATHS.arrowCurved,
      fill: LIGHT,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'spark',
    label: 'Spark strokes',
    hint: 'Yellow ticks that make the icon pop',
    size: [0.07, 0.11],
    apply: {
      shape: 'path',
      pathData: PATHS.spark,
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'backdrop',
    label: 'Character backdrop',
    hint: 'Soft panel behind the creator on the right 40%',
    size: [0.38, 0.92],
    apply: {
      shape: 'roundRect',
      fill: '#2A2D34',
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 28,
      effects: effects(),
    },
  },
  {
    id: 'underline',
    label: 'Accent underline',
    hint: 'Yellow rule under a word or the logo',
    size: [0.2, 0.02],
    apply: {
      shape: 'roundRect',
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 3,
      effects: effects(),
    },
  },
  {
    id: 'pill',
    label: 'Blue pill',
    hint: 'Small label — support and tooling topics',
    size: [0.18, 0.08],
    apply: {
      shape: 'roundRect',
      fill: BLUE,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 30,
      effects: effects(),
    },
  },
  {
    id: 'alert-bar',
    label: 'Alert bar',
    hint: 'Red rule for a warning thumbnail',
    size: [0.22, 0.02],
    apply: {
      shape: 'roundRect',
      fill: RED,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 3,
      effects: effects(),
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'Thin muted rule between blocks',
    size: [0.002, 0.14],
    apply: {
      shape: 'rect',
      fill: MUTED,
      fillEnabled: true,
      strokeEnabled: false,
      opacity: 55,
      effects: effects(),
    },
  },
]

const BACKGROUNDS: BrandBackground[] = [
  { id: 'ink', label: 'Ink', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: INK } },
  {
    id: 'ink-gradient',
    label: 'Ink gradient',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'gradient',
      color: INK,
      gradient: { from: '#24272E', to: '#121419', direction: 'to-bottom-right' },
    },
  },
  {
    // The guide allows six colours, so the "spotlight" is a neutral lift of the
    // ink rather than a seventh tinted one. Blue stays where the guide puts it:
    // on icons and support elements.
    id: 'spotlight',
    label: 'Ink spotlight',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'gradient',
      color: INK,
      gradient: { from: '#2A2F3A', to: '#121419', direction: 'radial' },
    },
  },
  {
    id: 'ink-grid',
    label: 'Ink grid',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'pattern',
      color: INK,
      pattern: { kind: 'grid', color: '#262A32', background: '#14161B', scale: 48 },
    },
  },
  { id: 'light', label: 'Light mode', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: LIGHT } },
]

/** No white sticker edge in this system — the creator is grounded by a shadow. */
const CUTOUT_EFFECTS: Effects = effects({
  shadow: { enabled: true, color: '#000000', opacity: 40, offsetX: 0, offsetY: 16, blur: 34 },
})

/** Natural grade: the guide's look is clean, not processed. */
const PHOTO_ADJUSTMENTS: Adjustments = {
  ...DEFAULT_ADJUSTMENTS,
  contrast: 8,
  highlights: -8,
  shadows: 8,
  sharpness: 6,
}

export const SUPER_LEARNER: BrandPreset = {
  id: 'super-learner',
  name: 'Brand 1',
  tagline: 'Learn · Focus · Remember · Grow',
  motto: 'Simple design. Big impact.',
  description: 'Consistent, minimal, clear — and readable in both dark and light YouTube modes.',
  format: 'thumbnail',
  canvas: CANVAS,
  palette: [
    { role: 'ink', name: 'Background', hex: INK, use: 'Canvas ground — works in light and dark mode', budget: [35, 65] },
    { role: 'light', name: 'Primary Text', hex: LIGHT, use: 'Headlines and high-contrast type', budget: [6, 20] },
    { role: 'yellow', name: 'Accent Yellow', hex: YELLOW, use: 'The one highlighted keyword, underlines, sparks', budget: [4, 14] },
    { role: 'blue', name: 'Secondary Blue', hex: BLUE, use: 'Support and icons', budget: [0, 8] },
    { role: 'red', name: 'Alert Red', hex: RED, use: 'Emphasis and warnings — sparingly', budget: [0, 5] },
    { role: 'muted', name: 'Secondary Text', hex: MUTED, use: 'Subtext, meta lines, dividers', budget: [0, 8] },
  ],
  ground: { label: 'Ink ground', roles: ['ink'], budget: [35, 65] },
  fonts: { headline: HEADLINE, supporting: SUPPORTING, accent: 'Caveat' },
  textStyles: TEXT_STYLES,
  elementStyles: ELEMENT_STYLES,
  backgrounds: BACKGROUNDS,
  cutout: { effects: CUTOUT_EFFECTS, outlineRange: [4, 10], requireOutline: false },
  photoAdjustments: PHOTO_ADJUSTMENTS,
  rules: {
    // The guide asks for 2–4 main words; its own reference thumbnail runs to
    // five ("WHY YOU FORGET SO FAST?"), so five is the ceiling, 2–4 the ideal.
    hookWords: [2, 5],
    prominentWordsMax: 8,
    highlights: [1, 1],
    subject: { side: 'right', share: LAYOUT.subjectShare },
    accentBudget: 6,
    maxLayers: 18,
  },
  checklist: [
    'One flat icon only — simple shapes, no fine detail',
    'The icon uses a brand colour',
    'Character expression matches the topic',
    'Readable in both light and dark YouTube modes',
    'Consistent with the last few thumbnails on the channel',
  ],
  attribution: 'Flat icons from Flaticon’s free tier need attribution — credit the author in the video description.',
  iconSlot: { label: 'Flat icon (Flaticon)', share: 0.14 },
}

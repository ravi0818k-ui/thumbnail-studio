import type { Adjustments, Effects } from '../types'
import { DEFAULT_ADJUSTMENTS, DEFAULT_BACKGROUND, DEFAULT_EFFECTS } from '../types'
import type { BrandBackground, BrandElementStyle, BrandPreset, BrandTextStyle } from './brands'

// ---------------------------------------------------------------------------
// Vivian — "Say less. Show one thing."
//
// A minimal charcoal system: copy in the left 60%, the presenter and exactly
// one flat outline icon in the right 40%, one yellow keyword and nothing else.
// It shares its palette and its two fonts with Brand 1, so what makes it its
// own preset is the restraint — a tight shadow envelope, no hand-drawn accents,
// and rules that fail a design for filling space rather than for leaving it.
// ---------------------------------------------------------------------------

export const INK = '#181A1F'
export const LIGHT = '#F5F5F0'
export const YELLOW = '#FFD43B'
export const BLUE = '#4DA3FF'
export const RED = '#FF4D4D'
export const MUTED = '#9CA3AF'

/** Generous by design: wider than Brand 1's 56, because the copy carries less. */
export const CANVAS = { width: 1280, height: 720, safeMargin: 64 }

/**
 * The copy/subject split, and the presenter's own width inside it. The
 * presenter is narrower than the zone it sits in — the sliver that is left is
 * the seam the icon hangs on, not space to fill.
 */
export const LAYOUT = { textShare: 0.6, subjectShare: 0.4, presenterShare: 0.33 }

/**
 * The whole effect budget, in one place. Every shadow in this brand is 25–40%
 * opaque, blurred 4–8 px and offset 2–4 px; anything heavier reads as a sticker
 * edge, and a glow is never allowed. The selftest holds these three ranges.
 */
export const SHADOW_SPEC = { opacity: [25, 40], blur: [4, 8], offset: [2, 4] } as const

function effects(over: Partial<Effects> = {}): Effects {
  return {
    shadow: { ...DEFAULT_EFFECTS.shadow, ...over.shadow },
    outline: { ...DEFAULT_EFFECTS.outline, ...over.outline },
    glow: { ...DEFAULT_EFFECTS.glow, ...over.glow },
    overlay: { ...DEFAULT_EFFECTS.overlay, ...over.overlay },
  }
}

/** Separation for type over artwork — just enough to keep the edge honest. */
const TEXT_SHADOW = { enabled: true, color: '#000000', opacity: 30, offsetX: 0, offsetY: 3, blur: 6 }
/** The presenter is grounded the same way; no outline, no plate, no rim light. */
const SUBJECT_SHADOW = { enabled: true, color: '#000000', opacity: 35, offsetX: 0, offsetY: 4, blur: 8 }

const HEADLINE = 'Anton'
const SUPPORTING = 'Inter'

const TEXT_STYLES: BrandTextStyle[] = [
  {
    id: 'hook',
    label: 'Headline',
    tier: 'L1',
    hint: '110–160 px · 2–4 words, uppercase',
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
    hint: 'Ink on the yellow block — the only highlight on the thumbnail',
    range: [110, 160],
    apply: {
      fontFamily: HEADLINE,
      fontWeight: 400,
      fontSize: 132,
      color: INK,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.02,
      letterSpacing: 0,
      align: 'left',
      bgEnabled: true,
      bgColor: YELLOW,
      bgPadding: 18,
      bgRadius: 6,
      // Ink on yellow is already the highest-contrast pair in the palette; a
      // shadow under it would only muddy the plate's edge.
      effects: effects(),
    },
  },
  {
    id: 'subhead',
    label: 'Subheadline',
    tier: 'L2',
    hint: '52–80 px · use instead of a second headline line, never as well as one',
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
      effects: effects({ shadow: TEXT_SHADOW }),
    },
  },
  {
    id: 'support',
    label: 'Supporting text',
    tier: 'L3',
    hint: '34–48 px · one idea, two lines at most',
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
    hint: '24–34 px · the widely tracked label under the copy',
    range: [24, 34],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 700,
      fontSize: 28,
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
    // Capped below the 55 px line the QA engine calls "prominent" on purpose:
    // a warning supports the hook, it does not become a second one.
    hint: '44–54 px · warnings, kept under the headline tier on purpose',
    range: [44, 54],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 900,
      fontSize: 50,
      color: RED,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.1,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
]

const ELEMENT_STYLES: BrandElementStyle[] = [
  {
    id: 'highlight',
    label: 'Highlight block',
    hint: 'Yellow block behind the one keyword',
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
    id: 'underline',
    label: 'Accent underline',
    hint: 'Yellow rule closing the copy column',
    size: [0.18, 0.014],
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
    label: 'Blue label pill',
    hint: 'Small category label above the headline',
    size: [0.18, 0.078],
    apply: {
      shape: 'roundRect',
      fill: BLUE,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 28,
      effects: effects(),
    },
  },
  {
    id: 'alert-bar',
    label: 'Alert bar',
    hint: 'Red rule for a warning thumbnail',
    size: [0.2, 0.014],
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
    id: 'accent-dot',
    label: 'Icon accent dot',
    hint: 'The icon’s single yellow note — one per thumbnail',
    size: [0.024, 0.042],
    apply: {
      shape: 'ellipse',
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'divider',
    label: 'Divider',
    hint: 'Thin muted rule between blocks',
    size: [0.002, 0.12],
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

// Charcoal is the ground in every variant. There is no light mode: the brand's
// contrast is built on white type over #181A1F, and inverting it would put the
// yellow keyword plate on a near-white field, where it stops reading as an
// accent at all.
const BACKGROUNDS: BrandBackground[] = [
  { id: 'ink', label: 'Charcoal', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: INK } },
  {
    id: 'ink-gradient',
    label: 'Charcoal gradient',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'gradient',
      color: INK,
      gradient: { from: '#24272E', to: '#121419', direction: 'to-bottom-right' },
    },
  },
  {
    id: 'spotlight',
    label: 'Charcoal spotlight',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'gradient',
      color: INK,
      gradient: { from: '#2A2F3A', to: '#121419', direction: 'radial' },
    },
  },
]

/** Shadow only — no sticker outline, which is why `requireOutline` is false. */
const CUTOUT_EFFECTS: Effects = effects({ shadow: SUBJECT_SHADOW })

/** A natural grade. The presenter should look photographed, not processed. */
const PHOTO_ADJUSTMENTS: Adjustments = {
  ...DEFAULT_ADJUSTMENTS,
  contrast: 6,
  highlights: -6,
  shadows: 6,
  sharpness: 5,
}

export const VIVIAN: BrandPreset = {
  id: 'vivian',
  name: 'Vivian',
  tagline: 'Charcoal · One keyword · One icon',
  motto: 'Say less. Show one thing.',
  description: 'Minimal charcoal thumbnails: copy left, presenter right, and exactly one idea on screen.',
  format: 'thumbnail',
  canvas: CANVAS,
  palette: [
    { role: 'ink', name: 'Charcoal', hex: INK, use: 'The dominant ground, in light and dark mode alike', budget: [45, 70] },
    { role: 'light', name: 'Primary Text', hex: LIGHT, use: 'Headlines — most words stay white', budget: [5, 18] },
    { role: 'yellow', name: 'Signature Yellow', hex: YELLOW, use: 'The one keyword, the underline, the icon accent', budget: [3, 12] },
    { role: 'blue', name: 'Optional Blue', hex: BLUE, use: 'Category labels and tooling topics', budget: [0, 7] },
    { role: 'red', name: 'Warning Red', hex: RED, use: 'Mistakes and warnings — rarely', budget: [0, 5] },
    { role: 'muted', name: 'Secondary Text', hex: MUTED, use: 'Supporting copy, meta lines, dividers', budget: [0, 8] },
  ],
  ground: { label: 'Charcoal ground', roles: ['ink'], budget: [45, 70] },
  fonts: { headline: HEADLINE, supporting: SUPPORTING },
  textStyles: TEXT_STYLES,
  elementStyles: ELEMENT_STYLES,
  backgrounds: BACKGROUNDS,
  cutout: { effects: CUTOUT_EFFECTS, outlineRange: [0, 0], requireOutline: false, requireCutout: true },
  photoAdjustments: PHOTO_ADJUSTMENTS,
  rules: {
    hookWords: [2, 4],
    // Six is the ceiling; the QA engine derives its ideal from it as four, and
    // four is the real target — a headline at that size and nothing else.
    prominentWordsMax: 6,
    highlights: [1, 1],
    subject: { side: 'right', share: LAYOUT.subjectShare },
    accentBudget: 5,
    // Low on purpose. Hitting this ceiling usually means decoration crept in.
    maxLayers: 10,
  },
  checklist: [
    'Exactly one icon — flat, 2D, outline style, no 3D and no gloss',
    'The icon is white with one small yellow accent',
    'The presenter fills 30–35% of the width and the pose suits the topic',
    'Only the single most important keyword is yellow',
    'Empty space has been left empty',
    'Readable at 168 px wide in both YouTube themes',
  ],
  attribution: 'Icons from Tabler (MIT) — free to use, no attribution required. Search the tabler set in the icon library.',
  iconSlot: { label: 'Flat icon (Tabler outline)', share: 0.13 },
}

import type { Adjustments, Effects } from '../types'
import type { BrandBackground, BrandColor, BrandElementStyle, BrandPreset, BrandTextStyle } from './brands'
import { DEFAULT_ADJUSTMENTS, DEFAULT_BACKGROUND, DEFAULT_EFFECTS } from '../types'

// ---------------------------------------------------------------------------
// Brand 2 — a channel thumbnail design system, encoded so the editor
// can apply it, and so the QA panel can check a design against it.
//
// Everything here is derived from the written spec: palette and colour budget,
// the four-level type scale, the shadow rules, the cut-out treatment and the
// element vocabulary (cards, marker highlights, brush strokes, arrows, tape).
// ---------------------------------------------------------------------------

export const BRAND_ID = 'ranjan-notes'
export const BRAND_NAME = 'Brand 2'

export const CANVAS = { width: 1280, height: 720, safeMargin: 64 }

export type ColorRole = 'ink' | 'yellow' | 'blue' | 'white' | 'paper' | 'green' | 'red'

// The preset shapes are shared with every other brand; importing them as types
// keeps this module free of a runtime cycle with the registry.
export type { BrandBackground, BrandColor, BrandElementStyle, BrandTextStyle, TextTier } from './brands'

export const PALETTE: BrandColor[] = [
  { role: 'ink', name: 'Deep Navy / Ink', hex: '#071525', use: 'Headings, brush labels, dark panels, borders', budget: [15, 25] },
  { role: 'yellow', name: 'Bright Yellow', hex: '#FFD21F', use: 'Highlight words, marker blocks, underlines', budget: [8, 15] },
  { role: 'blue', name: 'Electric Blue', hex: '#1677FF', use: 'Arrows, circles, AI / tech accents', budget: [3, 8] },
  { role: 'white', name: 'Clean White', hex: '#FFFFFF', use: 'Background, contrast, cut-out outlines' },
  { role: 'paper', name: 'Soft Paper White', hex: '#F7F8FA', use: 'Light backgrounds, note cards, panels' },
  { role: 'green', name: 'Soft Green', hex: '#27C96F', use: 'Check marks, positive results — sparingly' },
  { role: 'red', name: 'Accent Pink / Red', hex: '#FF4F6D', use: 'Warnings, emotional emphasis — sparingly' },
]

export const COLOR_BY_ROLE = Object.fromEntries(PALETTE.map((c) => [c.role, c.hex])) as Record<ColorRole, string>

export const INK = COLOR_BY_ROLE.ink
export const YELLOW = COLOR_BY_ROLE.yellow
export const BLUE = COLOR_BY_ROLE.blue
export const WHITE = COLOR_BY_ROLE.white
export const PAPER = COLOR_BY_ROLE.paper
export const GREEN = COLOR_BY_ROLE.green
export const RED = COLOR_BY_ROLE.red

/** Light ground (white + paper) should dominate the canvas. */
export const LIGHT_BUDGET: [number, number] = [55, 70]

// --------------------------------------------------------------- shadows ---

function effects(over: Partial<Effects> = {}): Effects {
  return {
    shadow: { ...DEFAULT_EFFECTS.shadow, ...over.shadow },
    outline: { ...DEFAULT_EFFECTS.outline, ...over.outline },
    glow: { ...DEFAULT_EFFECTS.glow, ...over.glow },
    overlay: { ...DEFAULT_EFFECTS.overlay, ...over.overlay },
  }
}

/** rgba(0,0,0,.18) · 0 / 4 · blur 10 — the everyday text shadow. */
export const TEXT_SHADOW = { enabled: true, color: '#000000', opacity: 18, offsetX: 0, offsetY: 4, blur: 10 }
/** rgba(0,0,0,.25) · 0 / 6 · blur 15 — for headlines over busy ground. */
export const HEADLINE_SHADOW = { enabled: true, color: '#000000', opacity: 25, offsetX: 0, offsetY: 6, blur: 15 }
/** Card / panel lift: black 14%, y 6, blur 16. */
export const CARD_SHADOW = { enabled: true, color: '#000000', opacity: 14, offsetX: 0, offsetY: 6, blur: 16 }

// ------------------------------------------------------------ type scale ---

const HEADLINE_FONT = 'Anton'

export const TEXT_STYLES: BrandTextStyle[] = [
  {
    id: 'hook',
    label: 'Hook',
    tier: 'L1',
    hint: '100–145 px · 1–4 words',
    range: [100, 145],
    apply: {
      fontFamily: HEADLINE_FONT,
      fontWeight: 400,
      fontSize: 124,
      color: INK,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 0.98,
      letterSpacing: 0,
      align: 'left',
      bgEnabled: false,
      effects: effects({ shadow: TEXT_SHADOW }),
    },
  },
  {
    id: 'hook-light',
    label: 'Hook on navy',
    tier: 'L1',
    hint: '100–145 px · white on dark panels',
    range: [100, 145],
    apply: {
      fontFamily: HEADLINE_FONT,
      fontWeight: 400,
      fontSize: 124,
      color: WHITE,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 0.98,
      align: 'left',
      bgEnabled: false,
      effects: effects({ shadow: HEADLINE_SHADOW }),
    },
  },
  {
    id: 'highlight',
    label: 'Marker highlight',
    tier: 'L1',
    hint: 'Navy on a yellow marker block · 1–2 words',
    range: [80, 145],
    apply: {
      fontFamily: HEADLINE_FONT,
      fontWeight: 400,
      fontSize: 112,
      color: INK,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1,
      align: 'center',
      bgEnabled: true,
      bgColor: YELLOW,
      bgPadding: 20,
      bgRadius: 6,
      effects: effects(),
    },
  },
  {
    id: 'explain',
    label: 'Explanation',
    tier: 'L2',
    hint: '55–85 px · bold',
    range: [55, 85],
    apply: {
      fontFamily: 'League Spartan',
      fontWeight: 800,
      fontSize: 72,
      color: INK,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.05,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'support',
    label: 'Supporting',
    tier: 'L3',
    hint: '32–52 px · medium / semibold',
    range: [32, 52],
    apply: {
      fontFamily: 'Poppins',
      fontWeight: 700,
      fontSize: 42,
      color: INK,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.25,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'label',
    label: 'Label',
    tier: 'L4',
    hint: '22–34 px · semibold, tracked',
    range: [22, 34],
    apply: {
      fontFamily: 'Montserrat',
      fontWeight: 700,
      fontSize: 28,
      color: INK,
      strokeWidth: 0,
      uppercase: true,
      letterSpacing: 2,
      lineHeight: 1.2,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'brush-label',
    label: 'Brush label',
    tier: 'L3',
    hint: 'White text to sit on a navy brush stroke',
    range: [28, 52],
    apply: {
      fontFamily: 'League Spartan',
      fontWeight: 800,
      fontSize: 38,
      color: WHITE,
      strokeWidth: 0,
      uppercase: true,
      lineHeight: 1.15,
      align: 'center',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'annotation',
    label: 'Handwritten note',
    tier: 'note',
    hint: '28–48 px · never for the main title',
    range: [28, 48],
    apply: {
      fontFamily: 'Caveat',
      fontWeight: 700,
      fontSize: 40,
      color: BLUE,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.1,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
]

// -------------------------------------------------------------- elements ---

/** Hand-drawn shapes, authored in a 100 × 100 box like the element library. */
export const BRAND_PATHS = {
  markerBlock: 'M1 13 C20 7 42 11 62 8 C78 6 90 10 99 7 L98 88 C80 93 58 88 38 91 C22 93 10 89 2 92 Z',
  brushStroke:
    'M2 24 C16 12 40 18 58 14 C74 11 88 16 99 12 C97 34 99 56 98 80 C80 90 54 82 34 86 C20 89 10 85 1 88 C3 66 1 46 2 24 Z',
  tape: 'M3 26 L97 9 L94 40 L1 57 Z',
  arrowHand:
    'M2 62 C22 40 46 30 70 32 L66 12 L99 44 L64 74 L69 54 C50 52 30 60 12 78 Z',
  underline: 'M2 52 C24 34 74 32 98 48 L97 76 C72 58 26 62 3 80 Z',
  circleSketch:
    'M50 4 C74 4 96 22 96 48 C96 76 74 94 50 94 C24 94 4 76 4 48 C4 22 26 4 50 4 Z M50 12 C30 12 12 26 12 48 C12 70 30 86 50 86 C70 86 88 70 88 48 C88 26 70 12 50 12 Z',
} as const

export const ELEMENT_STYLES: BrandElementStyle[] = [
  {
    id: 'card',
    label: 'Note card',
    hint: 'White card, navy border, soft lift',
    size: [0.26, 0.4],
    apply: {
      shape: 'roundRect',
      fill: WHITE,
      fillEnabled: true,
      stroke: INK,
      strokeEnabled: true,
      strokeWidth: 4,
      cornerRadius: 22,
      effects: effects({ shadow: CARD_SHADOW }),
    },
  },
  {
    id: 'panel',
    label: 'Navy panel',
    hint: 'Dark panel for white text',
    size: [0.3, 0.22],
    apply: {
      shape: 'roundRect',
      fill: INK,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 20,
      effects: effects({ shadow: CARD_SHADOW }),
    },
  },
  {
    id: 'marker',
    label: 'Marker block',
    hint: 'Yellow highlight behind a word',
    size: [0.28, 0.13],
    apply: {
      shape: 'path',
      pathData: BRAND_PATHS.markerBlock,
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      rotation: -1.5,
      effects: effects(),
    },
  },
  {
    id: 'brush',
    label: 'Brush stroke',
    hint: 'Navy stroke behind short white text',
    size: [0.4, 0.14],
    apply: {
      shape: 'path',
      pathData: BRAND_PATHS.brushStroke,
      fill: INK,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'underline',
    label: 'Marker underline',
    hint: 'Yellow sweep under a headline',
    size: [0.26, 0.05],
    apply: {
      shape: 'path',
      pathData: BRAND_PATHS.underline,
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'arrow-blue',
    label: 'Blue arrow',
    hint: 'Primary direction / transformation',
    size: [0.11, 0.11],
    apply: {
      shape: 'path',
      pathData: BRAND_PATHS.arrowHand,
      fill: BLUE,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'arrow-yellow',
    label: 'Yellow arrow',
    hint: 'Secondary direction',
    size: [0.11, 0.11],
    apply: {
      shape: 'path',
      pathData: BRAND_PATHS.arrowHand,
      fill: YELLOW,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'check',
    label: 'Check mark',
    hint: 'Green — positive result',
    size: [0.05, 0.05],
    apply: {
      shape: 'path',
      pathData: 'M6 50 L20 36 L38 54 L80 12 L94 26 L38 82 Z',
      fill: GREEN,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'circle',
    label: 'Sketch circle',
    hint: 'Blue ring around a detail',
    size: [0.16, 0.28],
    apply: {
      shape: 'path',
      pathData: BRAND_PATHS.circleSketch,
      fill: BLUE,
      fillEnabled: true,
      strokeEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'tape',
    label: 'Tape strip',
    hint: 'Off-white tape, slight transparency',
    size: [0.12, 0.06],
    apply: {
      shape: 'path',
      pathData: BRAND_PATHS.tape,
      fill: PAPER,
      fillEnabled: true,
      strokeEnabled: false,
      opacity: 88,
      effects: effects({ shadow: { ...CARD_SHADOW, blur: 10, offsetY: 3, opacity: 12 } }),
    },
  },
  {
    id: 'frame',
    label: 'Outer frame',
    hint: 'Optional 6 px navy border',
    size: [1, 1],
    apply: {
      shape: 'rect',
      fillEnabled: false,
      stroke: INK,
      strokeEnabled: true,
      strokeWidth: 6,
      effects: effects(),
    },
  },
]

// ------------------------------------------------------------ photo style --

/** Cut-out treatment: clean white outline plus a subtle, believable shadow. */
export const CUTOUT_EFFECTS: Effects = effects({
  outline: { enabled: true, color: WHITE, width: 8 },
  shadow: { enabled: true, color: '#000000', opacity: 28, offsetX: 6, offsetY: 10, blur: 22 },
})

export const OUTLINE_RANGE: [number, number] = [5, 10]

/** Natural-looking grade: no HDR, no plastic skin. */
export const PHOTO_ADJUSTMENTS: Adjustments = {
  ...DEFAULT_ADJUSTMENTS,
  contrast: 10,
  highlights: -10,
  shadows: 10,
  sharpness: 8,
}

// ----------------------------------------------------------- backgrounds ---

export const BACKGROUNDS: BrandBackground[] = [
  { id: 'paper', label: 'Soft paper', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: PAPER } },
  { id: 'white', label: 'Clean white', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: WHITE } },
  {
    id: 'blue-wash',
    label: 'Light blue wash',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'gradient',
      color: WHITE,
      gradient: { from: '#FFFFFF', to: '#E4EEFF', direction: 'to-bottom' },
    },
  },
  {
    id: 'paper-texture',
    label: 'Paper texture',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'pattern',
      color: PAPER,
      pattern: { kind: 'noise', color: '#C9D2DE', background: PAPER, scale: 40 },
    },
  },
  {
    id: 'grid-note',
    label: 'Note grid',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'pattern',
      color: PAPER,
      pattern: { kind: 'grid', color: '#E1E6EE', background: '#FBFCFD', scale: 42 },
    },
  },
  { id: 'navy', label: 'Navy panel', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: INK } },
]

// ---------------------------------------------------------------- content --

export const HEADLINE_EXAMPLES = [
  'GEMINI AI NOTES',
  'STOP FORGETTING',
  'MASTER JAVASCRIPT',
  'LEARN FASTER',
  'REMEMBER EVERYTHING',
  'FIX YOUR MEMORY',
]

/** Words worth putting on a marker block. */
export const HIGHLIGHT_WORDS = ['GEMINI', 'NOTES', 'MEMORY', 'FOCUS', 'AI', 'STOP', 'FASTER', 'SMARTER', 'REVISION']

/** Hook level: 1–4 words. */
export const HOOK_WORDS: [number, number] = [1, 4]
/** Ideal number of prominent words on the whole thumbnail. */
export const TITLE_WORDS: [number, number] = [3, 7]
/** Still acceptable before it reads as a paragraph. */
export const PROMINENT_WORDS_MAX = 12

// ---------------------------------------------------------------------------
// The same data in the shared preset shape, so the panel, the apply helpers and
// the QA engine can treat this channel like any other.
// ---------------------------------------------------------------------------

export const RANJAN_NOTES: BrandPreset = {
  id: BRAND_ID,
  name: BRAND_NAME,
  tagline: 'Clean · Educational · Premium',
  motto: 'Study smarter with AI',
  description: 'Navy, yellow and white notes styling with a clean white cut-out outline.',
  format: 'thumbnail',
  canvas: CANVAS,
  palette: PALETTE,
  ground: { label: 'Light ground', roles: ['white', 'paper'], budget: LIGHT_BUDGET },
  fonts: { headline: HEADLINE_FONT, supporting: 'Poppins', accent: 'Caveat' },
  textStyles: TEXT_STYLES,
  elementStyles: ELEMENT_STYLES,
  backgrounds: BACKGROUNDS,
  cutout: { effects: CUTOUT_EFFECTS, outlineRange: OUTLINE_RANGE, requireOutline: true },
  photoAdjustments: PHOTO_ADJUSTMENTS,
  rules: {
    hookWords: HOOK_WORDS,
    prominentWordsMax: PROMINENT_WORDS_MAX,
    accentBudget: 6,
    maxLayers: 26,
  },
  checklist: ['Face recognisable, expression fits the topic', `Thumbnail reads as a ${BRAND_NAME} thumbnail immediately`],
}

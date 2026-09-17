import type { Adjustments, Effects, ShapeFade } from '../types'
import { DEFAULT_ADJUSTMENTS, DEFAULT_BACKGROUND, DEFAULT_EFFECTS, DEFAULT_FADE } from '../types'
import type { BrandBackground, BrandElementStyle, BrandPreset, BrandTextStyle } from './brands'

// ---------------------------------------------------------------------------
// Brand 3 — full-bleed photography, sentence case, one red mark.
//
// Read off the channel's thumbnails rather than a written guide, so the rules
// here describe what the work consistently does:
//
//   * The photograph fills the frame. There is no cut-out and no illustrated
//     background — the room, the desk and the gesture are the composition.
//   * A black scrim, straight or angled, is laid over the side the copy sits
//     on. That is what makes white type readable over a bright room; it is the
//     one piece of "design" in the whole system.
//   * The headline is heavy sans in SENTENCE case, not capitals. Two to four
//     words, set enormous, hard against the left margin.
//   * Exactly one red mark per thumbnail: a bar beneath the headline, or a
//     plate behind a single word. Never both, never two.
//
// Everything else — the palette is black, white and red, full stop — follows
// from those four.
// ---------------------------------------------------------------------------

export const BLACK = '#000000'
export const WHITE = '#FFFFFF'
export const RED = '#FF0000'
export const GREY = '#9AA0A6'

export const CANVAS = { width: 1280, height: 720, safeMargin: 48 }

/** Copy on the left, the creator's gesture on the right. */
export const LAYOUT = { textShare: 0.5, subjectShare: 0.5 }

function effects(over: Partial<Effects> = {}): Effects {
  return {
    shadow: { ...DEFAULT_EFFECTS.shadow, ...over.shadow },
    outline: { ...DEFAULT_EFFECTS.outline, ...over.outline },
    glow: { ...DEFAULT_EFFECTS.glow, ...over.glow },
    overlay: { ...DEFAULT_EFFECTS.overlay, ...over.overlay },
  }
}

function fade(over: Partial<ShapeFade> = {}): ShapeFade {
  return { ...DEFAULT_FADE, ...over }
}

const HEADLINE = 'Inter'
const SUPPORTING = 'Inter'

/**
 * The type is set tight and huge. Negative tracking at this size is what keeps
 * a four-word line looking like one object instead of four.
 */
const TEXT_STYLES: BrandTextStyle[] = [
  {
    id: 'hook',
    label: 'Headline',
    tier: 'L1',
    hint: '120–180 px · 2–4 words · sentence case, never capitals',
    range: [120, 180],
    apply: {
      fontFamily: HEADLINE,
      fontWeight: 900,
      fontSize: 146,
      color: WHITE,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.0,
      letterSpacing: -3,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'keyword',
    label: 'Red keyword',
    tier: 'L1',
    hint: 'The one word on the red plate — at most one per thumbnail',
    range: [120, 180],
    apply: {
      fontFamily: HEADLINE,
      fontWeight: 900,
      fontSize: 146,
      color: WHITE,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.0,
      letterSpacing: -3,
      align: 'left',
      bgEnabled: true,
      bgColor: RED,
      bgPadding: 14,
      bgRadius: 0,
      effects: effects(),
    },
  },
  {
    id: 'hook-ink',
    label: 'Headline on white',
    tier: 'L1',
    hint: 'Black headline for the rare light-ground variant',
    range: [120, 180],
    apply: {
      fontFamily: HEADLINE,
      fontWeight: 900,
      fontSize: 146,
      color: BLACK,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.0,
      letterSpacing: -3,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'subhead',
    label: 'Second line',
    tier: 'L2',
    hint: '56–84 px · a qualifier under the headline, used sparingly',
    range: [56, 84],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 700,
      fontSize: 66,
      color: WHITE,
      strokeWidth: 0,
      uppercase: false,
      lineHeight: 1.1,
      letterSpacing: -1,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
  {
    id: 'meta',
    label: 'Tracked label',
    tier: 'L4',
    hint: '24–34 px · a small tracked line for a series or episode',
    range: [24, 34],
    apply: {
      fontFamily: SUPPORTING,
      fontWeight: 700,
      fontSize: 28,
      color: GREY,
      strokeWidth: 0,
      uppercase: true,
      letterSpacing: 6,
      lineHeight: 1.2,
      align: 'left',
      bgEnabled: false,
      effects: effects(),
    },
  },
]

/**
 * Shadows are first-class elements here, not an afterthought: without one there
 * is nowhere on a full-bleed photograph for white type to live.
 */
const ELEMENT_STYLES: BrandElementStyle[] = [
  {
    id: 'shadow-left',
    label: 'Black shadow · left',
    hint: 'Scrim down the left so the copy has a ground',
    size: [1, 1],
    apply: {
      shape: 'rect',
      fill: BLACK,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 0,
      fade: fade({ enabled: true, from: 'left', softness: 62, midpoint: 46 }),
      effects: effects(),
    },
  },
  {
    id: 'shadow-bottom',
    label: 'Black shadow · bottom',
    hint: 'Scrim along the bottom for a headline sitting low',
    size: [1, 1],
    apply: {
      shape: 'rect',
      fill: BLACK,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 0,
      fade: fade({ enabled: true, from: 'bottom', softness: 55, midpoint: 34 }),
      effects: effects(),
    },
  },
  {
    id: 'shadow-wedge',
    label: 'Angled shadow',
    hint: 'The diagonal cut — a hard edge leaning across the frame',
    size: [1, 1],
    apply: {
      shape: 'rect',
      fill: BLACK,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 0,
      // The lean is the fade's own angle, so the rectangle still covers the
      // canvas exactly instead of having to be oversized and rotated.
      fade: fade({ enabled: true, from: 'left', softness: 10, midpoint: 54, angle: 50 }),
      effects: effects(),
    },
  },
  {
    id: 'underline',
    label: 'Red bar',
    hint: 'The rule under the headline — square ends, no radius',
    size: [0.92, 0.05],
    apply: {
      shape: 'rect',
      fill: RED,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 0,
      effects: effects(),
    },
  },
  {
    id: 'plate',
    label: 'Red plate',
    hint: 'Block behind a single word, if you are not using the bar',
    size: [0.3, 0.14],
    apply: {
      shape: 'rect',
      fill: RED,
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 0,
      effects: effects(),
    },
  },
]

const BACKGROUNDS: BrandBackground[] = [
  { id: 'black', label: 'Black', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: BLACK } },
  {
    id: 'black-fade',
    label: 'Black fade',
    value: {
      ...DEFAULT_BACKGROUND,
      kind: 'gradient',
      color: BLACK,
      gradient: { from: '#000000', to: '#141414', direction: 'to-right' },
    },
  },
  { id: 'white', label: 'White', value: { ...DEFAULT_BACKGROUND, kind: 'solid', color: WHITE } },
]

/** No outline, no glow: the photograph is not a sticker. */
const CUTOUT_EFFECTS: Effects = effects()

/** Punchy but not graded: contrast up, blacks down, a little bite. */
const PHOTO_ADJUSTMENTS: Adjustments = {
  ...DEFAULT_ADJUSTMENTS,
  contrast: 12,
  saturation: -4,
  highlights: -10,
  shadows: -8,
  sharpness: 8,
}

export const JUSTIN_SUNG: BrandPreset = {
  id: 'justin-sung',
  name: 'Brand 3',
  tagline: 'Learn how to learn',
  motto: 'One photo. One sentence. One red mark.',
  description:
    'Full-bleed photography under a black scrim, a huge sentence-case headline, and exactly one red accent.',
  format: 'thumbnail',
  canvas: CANVAS,
  palette: [
    { role: 'black', name: 'Shadow black', hex: BLACK, use: 'The scrim the copy sits on', budget: [18, 60] },
    { role: 'white', name: 'Headline white', hex: WHITE, use: 'All headline and supporting type', budget: [4, 22] },
    { role: 'red', name: 'Signal red', hex: RED, use: 'The one mark: a bar or a plate, never both', budget: [1, 9] },
    { role: 'grey', name: 'Tracked grey', hex: GREY, use: 'Small tracked labels only', budget: [0, 4] },
  ],
  ground: { label: 'Black scrim', roles: ['black'], budget: [18, 60] },
  fonts: { headline: HEADLINE, supporting: SUPPORTING },
  textStyles: TEXT_STYLES,
  elementStyles: ELEMENT_STYLES,
  backgrounds: BACKGROUNDS,
  cutout: { effects: CUTOUT_EFFECTS, outlineRange: [0, 0], requireOutline: false, requireCutout: false },
  photoAdjustments: PHOTO_ADJUSTMENTS,
  rules: {
    hookWords: [2, 4],
    // Four words at headline size is the whole thumbnail; five is a sentence.
    prominentWordsMax: 6,
    // The bar and the plate are alternatives, so zero highlights is correct
    // for a bar layout and one is correct for a plate layout.
    highlights: [0, 1],
    subject: { side: 'right', share: LAYOUT.subjectShare },
    accentBudget: 9,
    maxLayers: 10,
  },
  checklist: [
    'Sentence case — never all capitals',
    'One red mark only: the bar or the plate, not both',
    'The headline sits on the black, never across the face',
    'The photograph is sharp, eye contact or an active gesture',
    'The scrim is dark enough that white type needs no outline',
  ],
}

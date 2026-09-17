// ---------------------------------------------------------------------------
// Colour psychology — what each hue communicates, and whether it survives a
// thumbnail.
//
// The meanings are the standard design-school reading of the twelve hues. They
// are reference, not rules, and they are pure data so the page is a renderer
// with no knowledge of colour in it.
//
// What makes this more than a poster is the contrast maths at the bottom: every
// hue is scored against a dark and a light ground, because a colour that means
// the right thing and cannot be read at 120px wide is the wrong colour.
// ---------------------------------------------------------------------------

/** A spectral band in nanometres. Null for hues with no single wavelength. */
export interface Wavelength {
  from: number
  to: number
}

export interface ColorMeaning {
  id: string
  name: string
  hex: string
  /** What the hue makes a viewer feel. */
  emotions: string[]
  /** Where it is conventionally used. */
  industries: string[]
  /** What a designer reaches for it to do. */
  usedTo: string[]
  wavelength: Wavelength | null
  /** A caveat worth knowing before using it, when there is one. */
  caution: string | null
}

export const COLOR_MEANINGS: ColorMeaning[] = [
  {
    id: 'red',
    name: 'Red',
    hex: '#E11D28',
    emotions: ['Excitement', 'Energy', 'Passion', 'Courage', 'Attention'],
    industries: ['Entertainment', 'Food', 'Sport', 'Fire protection', 'Children’s products'],
    usedTo: ['Stimulate', 'Create urgency', 'Draw attention', 'Warn', 'Encourage'],
    wavelength: { from: 700, to: 635 },
    caution: 'Urgency wears out. A red that is everywhere stops meaning anything.',
  },
  {
    id: 'orange',
    name: 'Orange',
    hex: '#F2761A',
    emotions: ['Optimism', 'Independence', 'Adventure', 'Creativity', 'Fun'],
    industries: ['Art', 'Entertainment', 'Food', 'Sports', 'Transportation'],
    usedTo: ['Stimulate', 'Communicate fun', 'Draw attention', 'Express freedom', 'Fascinate'],
    wavelength: { from: 635, to: 590 },
    caution: null,
  },
  {
    id: 'yellow',
    name: 'Yellow',
    hex: '#F7CB15',
    emotions: ['Enthusiasm', 'Opportunity', 'Spontaneity', 'Happiness', 'Positivity'],
    industries: ['Food', 'Sports', 'Transportation', 'Travel', 'Leisure'],
    usedTo: ['Awaken awareness', 'Energize', 'Lift mood', 'Encourage relaxation'],
    wavelength: { from: 590, to: 560 },
    caution: 'Almost unreadable on white. It is a highlight colour, not a text colour on light grounds.',
  },
  {
    id: 'lime-green',
    name: 'Lime green',
    hex: '#8DC63F',
    emotions: ['Growth', 'Harmony', 'Fertility', 'Kindness', 'Dependability'],
    industries: ['Environment', 'Leisure', 'Alternative energy', 'Entertainment', 'Education'],
    usedTo: ['Restore energy', 'Promote health', 'Nurture', 'Rejuvenate'],
    wavelength: { from: 560, to: 520 },
    caution: null,
  },
  {
    id: 'kelly-green',
    name: 'Kelly green',
    hex: '#1DA24B',
    emotions: ['Safety', 'Harmony', 'Stability', 'Reliability', 'Balance'],
    industries: ['Environment', 'Banking', 'Real estate', 'Farming', 'Non-profit'],
    usedTo: ['Relax', 'Balance', 'Revitalize', 'Encourage', 'Reassure'],
    wavelength: { from: 560, to: 520 },
    caution: null,
  },
  {
    id: 'sky-blue',
    name: 'Sky blue',
    hex: '#2BB3E4',
    emotions: ['Freedom', 'Self-expression', 'Trustworthiness', 'Wisdom', 'Joy'],
    industries: ['Entertainment', 'Communication', 'Children’s products', 'Technology', 'Aerospace'],
    usedTo: ['Draw attention', 'Inspire trust', 'Suggest precision', 'Stimulate productivity'],
    wavelength: { from: 520, to: 490 },
    caution: null,
  },
  {
    id: 'royal-blue',
    name: 'Royal blue',
    hex: '#1B3F94',
    emotions: ['Trust', 'Responsibility', 'Honesty', 'Loyalty', 'Inner security'],
    industries: ['Security', 'Finance', 'Technology', 'Health care', 'Accounting'],
    usedTo: ['Reduce stress', 'Create calmness', 'Relax', 'Reassure', 'Create order'],
    wavelength: { from: 490, to: 450 },
    caution: 'Dark enough to vanish into a dark background. Give it a light ground or an outline.',
  },
  {
    id: 'violet',
    name: 'Violet',
    hex: '#7D2E8D',
    emotions: ['Imagination', 'Spirituality', 'Compassion', 'Sensitivity', 'Mystery'],
    industries: ['Humanitarian', 'Wellness', 'Religion', 'Luxury goods'],
    usedTo: ['Encourage creativity', 'Inspire', 'Imply luxury', 'Combine wisdom and power'],
    wavelength: { from: 450, to: 400 },
    caution: 'Dark enough to vanish into a dark background. Give it a light ground or an outline.',
  },
  {
    id: 'pink',
    name: 'Pink',
    hex: '#EA5F92',
    emotions: ['Compassion', 'Love', 'Playfulness', 'Youth', 'Admiration'],
    industries: ['Children’s products', 'Women’s products', 'Beauty', 'Fashion'],
    usedTo: ['Communicate energy', 'Increase pulse', 'Motivate action', 'Fascinate'],
    wavelength: null,
    caution: null,
  },
  {
    id: 'brown',
    name: 'Brown',
    hex: '#6D3B22',
    emotions: ['Reliability', 'Stability', 'Honesty', 'Comfort', 'Naturalness'],
    industries: ['Agriculture', 'Construction', 'Transportation', 'Legal', 'Food'],
    usedTo: ['Stabilize', 'Imply common sense', 'Suppress emotion', 'Create warmth'],
    wavelength: null,
    caution: 'Reads as low energy at thumbnail size. Rarely the colour of a click.',
  },
  {
    id: 'gray',
    name: 'Gray',
    hex: '#7E7E7E',
    emotions: ['Neutrality', 'Practicality', 'Conservatism', 'Formality', 'Quiet'],
    industries: ['Every industry — almost always alongside another colour'],
    usedTo: ['Create composure', 'Lower energy', 'Suggest timelessness', 'Communicate maturity'],
    wavelength: null,
    caution: 'Lowers energy by design. On a thumbnail competing with twenty others, that is a cost.',
  },
  {
    id: 'black',
    name: 'Black',
    hex: '#111111',
    emotions: ['Power', 'Control', 'Authority', 'Discipline', 'Elegance'],
    industries: ['Every industry — almost always alongside another colour'],
    usedTo: ['Radiate authority', 'Intimidate', 'Hide detail', 'Associate with mystery'],
    wavelength: null,
    caution: null,
  },
]

/** The claims the reference leads with — data, so the page holds no prose. */
export const COLOR_INFLUENCE: string[] = [
  'Colour is the first thing anyone notices about your work, before a single word is read.',
  'Around 90% of snap judgements about a product are made on colour alone.',
  'Red is the first colour we distinguish after birth. Blue is the favourite worldwide.',
  'Warm hues advance towards the viewer; cool hues recede. That is depth for free.',
]

export interface ColorProperty {
  name: string
  description: string
}

export const COLOR_PROPERTIES: ColorProperty[] = [
  { name: 'Hue', description: 'The colour itself, or a combination of colours — red, yellow, orange.' },
  { name: 'Value', description: 'How light or dark it is. Lighter is a tint, darker is a shade.' },
  { name: 'Chroma', description: 'Its intensity, or saturation. High chroma shouts, low chroma murmurs.' },
]

// --- colour maths -----------------------------------------------------------

/** '#rrggbb' to its three channels. Returns black for anything unparseable. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return [0, 0, 0]
  const value = parseInt(match[1], 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** Blends towards white (`amount` > 0) or black (`amount` < 0), -1..1. */
export function mixHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const target = amount >= 0 ? 255 : 0
  const t = Math.min(1, Math.abs(amount))
  return rgbToHex(r + (target - r) * t, g + (target - g) * t, b + (target - b) * t)
}

export function tintOf(hex: string): string {
  return mixHex(hex, 0.45)
}

export function shadeOf(hex: string): string {
  return mixHex(hex, -0.4)
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [light, dark] = la > lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The grounds a hue can carry text over. 3:1 is the WCAG threshold for large
 * text, and a headline on a thumbnail is always large text.
 */
export const LARGE_TEXT_CONTRAST = 3

export const DARK_GROUND = '#111111'
export const LIGHT_GROUND = '#ffffff'

export function readsOnDark(hex: string): boolean {
  return contrastRatio(hex, DARK_GROUND) >= LARGE_TEXT_CONTRAST
}

export function readsOnLight(hex: string): boolean {
  return contrastRatio(hex, LIGHT_GROUND) >= LARGE_TEXT_CONTRAST
}

/** Every word a hue can be found by, lowercased. */
export function searchTerms(meaning: ColorMeaning): string {
  return [meaning.name, ...meaning.emotions, ...meaning.industries, ...meaning.usedTo].join(' ').toLowerCase()
}

/**
 * Finds hues by feeling, industry or intent — 'finance' lands on royal blue,
 * 'urgency' on red. An empty query is every hue, in spectrum order.
 */
export function searchColorMeanings(query: string, meanings: ColorMeaning[] = COLOR_MEANINGS): ColorMeaning[] {
  const q = query.trim().toLowerCase()
  if (!q) return meanings
  return meanings.filter((m) => searchTerms(m).includes(q))
}

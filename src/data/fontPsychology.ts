// ---------------------------------------------------------------------------
// Font psychology — what each category of typeface communicates, and how to
// pick one for a thumbnail.
//
// Same shape as colorPsychology.ts and for the same reason: the meanings are
// the standard design-school reading, they are reference rather than rules, and
// they are pure data so the page is a renderer with no typography knowledge in
// it. Adding or re-wording a category is a data edit.
//
// The one part that is not convention is `families`: every name in it must be a
// family the font picker actually offers, because a guide that recommends a face
// the editor cannot set is advice nobody can act on. The selftest pins that.
// ---------------------------------------------------------------------------

import { FONTS } from './fonts'

/** A CSS stack for a specimen we only ever *show*. See `SPECIMEN_NOTE`. */
export type SpecimenStack = string

export interface FontCategory {
  id: string
  name: string
  /** The one-word character, as the final mental model states it. */
  tagline: string
  /** How to recognise it by eye. */
  characteristic: string
  /** What the category says first. */
  primary: string[]
  /** What it also says, depending on the face, the weight and the setting. */
  secondary: string[]
  /** Where it is conventionally used. */
  uses: string[]
  /** Faces a designer would name, whether or not this app ships them. */
  examples: string[]
  /**
   * Families from `FONTS` that belong to this category, so the guide can hand
   * the reader something they can apply. Empty when the library has none.
   */
  families: string[]
  /** What the specimen line is rendered in — a real face or a system stack. */
  specimen: SpecimenStack
  /** A caveat worth knowing before reaching for it. */
  caution: string | null
}

/**
 * Shown on a category whose `families` is empty: the reader is looking at a
 * system face for teaching purposes and cannot apply it from here.
 */
export const SPECIMEN_NOTE = 'Shown in a system face — the font list has none of these yet, so it cannot be applied.'

/** The line every specimen is set in, so categories are compared on one string. */
export const SPECIMEN_TEXT = 'FIX YOUR FOCUS'

export const FONT_PRINCIPLE = 'The words communicate the message. The font communicates the feeling.'

/** The same words, set differently, land differently. */
export const FONT_SIGNALS: Array<[string, string]> = [
  ['Serious', 'Casual'],
  ['Traditional', 'Modern'],
  ['Elegant', 'Playful'],
  ['Soft', 'Powerful'],
  ['Expensive', 'Affordable'],
  ['Fast', 'Slow'],
  ['Professional', 'Friendly'],
]

export const FONT_CATEGORY_MEANINGS: FontCategory[] = [
  {
    id: 'serif',
    name: 'Serif',
    tagline: 'Established',
    characteristic: 'Small finishing strokes at the ends of the letters.',
    primary: ['Formal', 'Traditional', 'Serious', 'Established'],
    secondary: ['Elegant', 'Classy', 'Luxurious', 'Premium'],
    uses: ['Books', 'Newspapers', 'Academic material', 'Law', 'Finance', 'Luxury brands', 'Editorial'],
    examples: ['Times New Roman', 'Georgia', 'Garamond', 'Baskerville'],
    families: [],
    specimen: 'Georgia, "Times New Roman", Times, serif',
    caution:
      'Fine serifs thin out at thumbnail size. Reach for it when the topic is research, science or history — not for a hook that has to read at 120px wide.',
  },
  {
    id: 'sans-serif',
    name: 'Sans serif',
    tagline: 'Clean',
    characteristic: 'No finishing strokes — “sans” means without. Letters end clean.',
    primary: ['Clean', 'Modern', 'Simple', 'Neutral'],
    secondary: ['Direct', 'Accessible', 'Minimal'],
    uses: ['Websites', 'Apps', 'Technology', 'Presentations', 'Education', 'Modern branding'],
    examples: ['Helvetica', 'Arial', 'Inter', 'Roboto', 'Montserrat', 'Poppins'],
    families: [
      'Inter',
      'Poppins',
      'Montserrat',
      'League Spartan',
      'Archivo Black',
      'Anton',
      'Bebas Neue',
      'Oswald',
      'Teko',
    ],
    specimen: '"Inter", system-ui, sans-serif',
    caution:
      'Neutral is not emotionless — it is a low emotional signal, which is what you want when the photo, the colour and the words should carry the feeling.',
  },
  {
    id: 'script',
    name: 'Script',
    tagline: 'Personal',
    characteristic: 'Drawn from handwriting, calligraphy or brush lettering.',
    primary: ['Soft', 'Romantic', 'Creative', 'Elegant'],
    secondary: ['Personal', 'Beautiful', 'Handmade', 'Feminine'],
    uses: ['Weddings', 'Beauty', 'Fashion', 'Invitations', 'Personal branding', 'Handmade products'],
    examples: ['Brush lettering', 'Calligraphy', 'Caveat', 'Permanent Marker'],
    families: ['Caveat', 'Permanent Marker', 'Patrick Hand'],
    specimen: '"Caveat", "Segoe Script", cursive',
    caution:
      'Do not use a script because it is beautiful. “5 MEMORY TECHNIQUES” in a script loses readability and fights the educational message.',
  },
  {
    id: 'display',
    name: 'Display',
    tagline: 'Expressive',
    characteristic: 'Distinctive letterforms built to be seen big. The font is part of the design.',
    primary: ['Bold', 'Energetic', 'Fun', 'Powerful'],
    secondary: ['Fast', 'Youthful', 'Dramatic', 'Casual'],
    uses: ['Posters', 'Sport', 'Gaming', 'Gym', 'Entertainment', 'YouTube thumbnails', 'Announcements'],
    examples: ['Luckiest Guy', 'Impact', 'Rubik Mono One', 'Anton'],
    families: ['Luckiest Guy', 'Impact', 'Rubik Mono One', 'Anton'],
    specimen: '"Luckiest Guy", Impact, sans-serif',
    caution: 'Expressive costs seriousness. On a serious topic an extra-bold sans usually lands harder.',
  },
  {
    id: 'slab-serif',
    name: 'Slab serif',
    tagline: 'Strong and approachable',
    characteristic: 'Serifs that are thick and block-like instead of curved and tapered.',
    primary: ['Serious', 'Solid', 'Educational'],
    secondary: ['Friendly', 'Casual', 'Vintage', 'Poster-like'],
    uses: ['Education', 'Schools', 'Posters', 'Editorial', 'Vintage branding', 'Sport'],
    examples: ['Rockwell', 'Roboto Slab', 'Courier'],
    families: [],
    specimen: 'Rockwell, "Roboto Slab", "Courier New", Georgia, serif',
    caution: 'The middle ground: traditional shapes at a heavy weight, so it reads serious without reading formal.',
  },
]

/**
 * Weight is half the message. The same sans serif goes from delicate to
 * dominant across this scale, which is why an extra-bold sans starts behaving
 * visually like a display face.
 */
export interface WeightFeeling {
  weight: number
  name: string
  feeling: string
}

export const WEIGHT_FEELINGS: WeightFeeling[] = [
  { weight: 100, name: 'Thin', feeling: 'Light, delicate, sophisticated' },
  { weight: 300, name: 'Light', feeling: 'Clean, calm, modern' },
  { weight: 400, name: 'Regular', feeling: 'Neutral, readable, informative' },
  { weight: 500, name: 'Medium', feeling: 'Balanced, confident' },
  { weight: 700, name: 'Bold', feeling: 'Strong, important' },
  { weight: 800, name: 'Extra bold', feeling: 'Powerful, energetic, attention-grabbing' },
  { weight: 900, name: 'Black', feeling: 'Extremely strong, dramatic, dominant' },
]

/** Topic → the feeling to aim for → the category that carries it. */
export interface TopicDirection {
  topic: string
  feeling: string
  direction: string
}

export const TOPIC_DIRECTIONS: TopicDirection[] = [
  { topic: 'Memory', feeling: 'Smart, interesting', direction: 'Bold sans serif' },
  { topic: 'Focus', feeling: 'Strong, direct', direction: 'Extra-bold sans serif' },
  { topic: 'Speed reading', feeling: 'Speed, energy', direction: 'Display or bold sans serif' },
  { topic: 'Study tips', feeling: 'Clear, trustworthy', direction: 'Sans serif' },
  { topic: 'Brain science', feeling: 'Intelligent, scientific', direction: 'Clean sans serif' },
  { topic: 'Exam tips', feeling: 'Serious, important', direction: 'Serif or strong sans serif' },
  { topic: 'Motivation', feeling: 'Powerful', direction: 'Display or extra bold' },
  { topic: 'Mistakes', feeling: 'Warning, urgency', direction: 'Extra bold or display' },
  { topic: 'Premium product', feeling: 'Premium', direction: 'Elegant serif' },
  { topic: 'Personal story', feeling: 'Personal, emotional', direction: 'Script or friendly sans serif' },
]

/** One message, four settings — the clearest demonstration that weight talks. */
export interface Treatment {
  id: string
  label: string
  feeling: string
  specimen: SpecimenStack
  weight: number
}

export const SAME_MESSAGE_TREATMENTS: Treatment[] = [
  { id: 'regular', label: 'Regular sans', feeling: 'Calm · Informative · Neutral', specimen: '"Inter", sans-serif', weight: 400 },
  { id: 'bold', label: 'Bold sans', feeling: 'Confident · Important', specimen: '"Inter", sans-serif', weight: 700 },
  { id: 'black', label: 'Extra-bold sans', feeling: 'Strong · Urgent · Energetic', specimen: '"Inter", sans-serif', weight: 900 },
  { id: 'display', label: 'Display', feeling: 'Expressive · Playful · Less serious', specimen: '"Luckiest Guy", Impact, sans-serif', weight: 400 },
]

/**
 * Perceived emotion is never the typeface alone. Listing the inputs is the
 * antidote to "serif = serious", which is the most common way this subject is
 * got wrong.
 */
export const PERCEPTION_INPUTS = [
  'Typeface',
  'Weight',
  'Size',
  'Spacing',
  'Colour',
  'Capitalisation',
  'Layout',
  'Words',
  'Images',
]

/** The hierarchy rule: one expressive face, one neutral one. */
export interface Role {
  role: string
  family: string
  sample: string
  why: string[]
}

export const FONT_SYSTEM: Role[] = [
  {
    role: 'Main headline',
    family: 'Anton',
    sample: 'SPEED READING',
    why: ['Bold', 'Condensed', 'Highly visible', 'Strong at small sizes'],
  },
  {
    role: 'Supporting text',
    family: 'Inter',
    sample: 'Learn faster. Remember more.',
    why: ['Clean', 'Neutral', 'Highly readable', 'Excellent small'],
  },
]

/** Two fonts is a system. Ten is a mess. */
export const FONT_SYSTEM_RULE =
  'Two primary fonts plus an occasional special treatment is enough. A consistent pair becomes part of the brand; a new font every video becomes noise.'

/**
 * The decision tree, as data rather than ASCII art. Each branch is a feeling
 * and the category it points at; the default is the fallback when unsure.
 */
export interface Branch {
  feeling: string
  category: string
}

export const DECISION_BRANCHES: Branch[] = [
  { feeling: 'Serious', category: 'Serif or strong sans' },
  { feeling: 'Energetic', category: 'Display or extra-bold sans' },
  { feeling: 'Modern and clear', category: 'Sans serif' },
  { feeling: 'Personal', category: 'Script' },
  { feeling: 'Serious but friendly', category: 'Slab serif' },
]

export const DECISION_DEFAULT = 'Unsure? Start with sans serif, then adjust towards the feeling you want.'

/** The formula, with the worked example the article ends on. */
export interface FormulaStep {
  step: string
  example: string
}

export const FORMULA_STEPS: FormulaStep[] = [
  { step: 'Topic', example: 'Speed reading' },
  { step: 'Emotion', example: 'Speed and energy' },
  { step: 'Category', example: 'Display or bold sans serif' },
  { step: 'Font', example: 'Anton' },
  { step: 'Weight', example: 'Bold to black' },
  { step: 'Size', example: '90–120 px' },
]

/**
 * Typography and colour are one decision. These are the charcoal preset's three
 * values — the selftest checks they still match `data/vivian.ts`, since a
 * worked example that has drifted from the brand it cites teaches the wrong
 * thing.
 */
export interface PairingPart {
  text: string
  hex: string
  role: string
  weightName: string
}

export const PAIRING_GROUND = '#181A1F'

export const PAIRING_EXAMPLE: PairingPart[] = [
  { text: 'WHY YOU', hex: '#F5F5F0', role: 'Neutral information', weightName: 'Anton' },
  { text: 'FORGET', hex: '#FFD43B', role: 'Visual emphasis', weightName: 'Anton, larger' },
]

export const CLOSING_RULE =
  'Don’t choose a font because it is beautiful; choose it because it makes your message feel right.'

// ------------------------------------------------------------------ helpers ---

/** The `FontDef`s a category offers, in font-list order. */
export function fontsInCategory(category: FontCategory) {
  return FONTS.filter((f) => category.families.includes(f.family))
}

/**
 * The weight to land on when a family is applied from here. Families carry
 * different scales — Anton is 400 only — so a text layer at 900 must come down
 * to something the face actually has, or it renders as a synthetic bold.
 */
export function nearestWeight(family: string, wanted: number): number {
  const font = FONTS.find((f) => f.family === family)
  if (!font || font.weights.length === 0) return wanted
  return font.weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), font.weights[0])
}

/** Every word a category can be found by, lowercased. */
export function searchTerms(category: FontCategory): string {
  return [category.name, category.tagline, ...category.primary, ...category.secondary, ...category.uses, ...category.examples]
    .join(' ')
    .toLowerCase()
}

/**
 * Finds categories by feeling, use or face — 'luxury' lands on serif, 'gaming'
 * on display. An empty query is every category, in teaching order.
 */
export function searchFontCategories(
  query: string,
  categories: FontCategory[] = FONT_CATEGORY_MEANINGS,
): FontCategory[] {
  const q = query.trim().toLowerCase()
  if (!q) return categories
  return categories.filter((c) => searchTerms(c).includes(q))
}

/** The direction rows matching a topic word, for the topic lookup. */
export function searchTopics(query: string, rows: TopicDirection[] = TOPIC_DIRECTIONS): TopicDirection[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((r) => `${r.topic} ${r.feeling} ${r.direction}`.toLowerCase().includes(q))
}

import type { Effects, SceneObject, TextAccent, TextObject } from '../types'
import { DEFAULT_EFFECTS } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import { newId } from '../engine/assets'

// ---------------------------------------------------------------------------
// The text collection: the pieces a minimal news or quote post is assembled
// from — a headline with one coloured phrase, a kicker, a label plate, a
// banner, a footer line, a tweet-style card, a meme caption. Each part builds
// real layers sized to the canvas, so it lands ready to retype rather than as
// a style to configure. `TextPanel` renders the list and knows none of it.
//
// Sizes are written for a 1080 × 1350 post and scale by `fit`, so the same
// part drops onto a square or landscape post, or a thumbnail, in proportion.
// ---------------------------------------------------------------------------

export type TextPartGroup = 'Headlines' | 'Labels' | 'Cards' | 'Captions'

export const TEXT_PART_GROUPS: TextPartGroup[] = ['Headlines', 'Labels', 'Cards', 'Captions']

export interface TextPart {
  id: string
  label: string
  group: TextPartGroup
  /** What it is for, shown as the tile's tooltip. */
  hint: string
  build: (width: number, height: number) => SceneObject[]
}

/** The accent covering `phrase` in `text` (its first occurrence). */
export function accentOn(text: string, phrase: string, color: string): TextAccent {
  const start = text.indexOf(phrase)
  if (start < 0) throw new Error(`"${phrase}" is not in "${text}"`)
  return { start, end: start + phrase.length, color }
}

function fx(over: Partial<Effects>): Effects {
  return {
    shadow: { ...DEFAULT_EFFECTS.shadow, ...over.shadow },
    outline: { ...DEFAULT_EFFECTS.outline, ...over.outline },
    glow: { ...DEFAULT_EFFECTS.glow, ...over.glow },
    overlay: { ...DEFAULT_EFFECTS.overlay, ...over.overlay },
  }
}

/** Plain sans text with no thumbnail stroke — the starting point of every part. */
function plain(partial: Partial<TextObject>): TextObject {
  return createText({
    fontFamily: 'Inter',
    fontWeight: 700,
    uppercase: false,
    strokeWidth: 0,
    lineHeight: 1.2,
    color: '#ffffff',
    ...partial,
    effects: partial.effects ?? fx({}),
  })
}

/** The reference post's scale, shrunk to whichever side is tighter, so a landscape post keeps a part whole. */
export const fit = (w: number, h: number) => Math.min(w / 1080, h / 1350)

/** Laid out against the margin every post format uses. */
const margin = (w: number) => Math.round(w * 0.06)

const NEWS = 'Biggest scam in corporate is being good at your job, says one creator.'
const TWEET = 'Requirements: Full Stack, Full DevOps, Full Cloud, Full AI.\nSalary: Half Stack'

export const TEXT_PARTS: TextPart[] = [
  {
    id: 'headline-accent',
    label: 'Headline + colour',
    group: 'Headlines',
    hint: 'A news headline with one phrase in colour. Click words in "Coloured words" to change which.',
    build: (w, h) => {
      const k = fit(w, h)
      return [
        plain({
          name: 'Headline',
          text: NEWS,
          fontFamily: 'Poppins',
          fontWeight: 700,
          fontSize: Math.round(54 * k),
          x: margin(w),
          y: Math.round(h * 0.62),
          width: w - margin(w) * 2,
          height: Math.round(200 * k),
          accents: [accentOn(NEWS, 'Biggest scam in corporate', '#a3e635')],
          effects: fx({ shadow: { enabled: true, color: '#000000', blur: 16, offsetX: 0, offsetY: 4, opacity: 55 } }),
        }),
      ]
    },
  },
  {
    id: 'statement',
    label: 'Big statement',
    group: 'Headlines',
    hint: 'One short line, large and centred, with the punchline in colour.',
    build: (w, h) => {
      const k = fit(w, h)
      const text = 'Has ₹1.5 lakh become the new ₹15,000?'
      return [
        plain({
          name: 'Statement',
          text,
          fontFamily: 'Inter',
          fontWeight: 900,
          fontSize: Math.round(72 * k),
          align: 'center',
          lineHeight: 1.15,
          x: margin(w),
          y: Math.round(h * 0.4),
          width: w - margin(w) * 2,
          height: Math.round(180 * k),
          accents: [accentOn(text, '₹1.5 lakh', '#facc15'), accentOn(text, '₹15,000?', '#facc15')],
        }),
      ]
    },
  },
  {
    id: 'kicker',
    label: 'Kicker',
    group: 'Labels',
    hint: 'The small spaced label above a headline — the section or series name.',
    build: (w, h) => {
      const k = fit(w, h)
      return [
        plain({
          name: 'Kicker',
          text: '⚡ LITE UPDATES',
          fontSize: Math.round(24 * k),
          letterSpacing: Math.round(3 * k),
          color: '#e5e7eb',
          x: margin(w),
          y: Math.round(h * 0.56),
          width: Math.round(w * 0.5),
          height: Math.round(32 * k),
          autoHeight: true,
        }),
      ]
    },
  },
  {
    id: 'label-plate',
    label: 'Label plate',
    group: 'Labels',
    hint: 'A coloured plate behind one word, like "HEADLINE:" above the story.',
    build: (w, h) => {
      const k = fit(w, h)
      return [
        plain({
          name: 'Label',
          text: 'HEADLINE:',
          fontFamily: 'Oswald',
          fontWeight: 700,
          fontSize: Math.round(44 * k),
          color: '#111111',
          bgEnabled: true,
          bgColor: '#facc15',
          bgPadding: Math.round(10 * k),
          bgRadius: Math.round(4 * k),
          x: margin(w),
          y: Math.round(h * 0.6),
          width: Math.round(w * 0.4),
          height: Math.round(70 * k),
          noWrap: true,
        }),
      ]
    },
  },
  {
    id: 'top-banner',
    label: 'Top banner',
    group: 'Labels',
    hint: 'A full-width bar across the top with a shouted headline — "SHOCKING NEWS!".',
    build: (w, h) => {
      const k = fit(w, h)
      const groupId = newId('g')
      const bar = Math.round(140 * k)
      return [
        createShape({ name: 'Banner bar', shape: 'rect', x: 0, y: 0, width: w, height: bar, fill: '#facc15', cornerRadius: 0, groupId }),
        plain({
          name: 'Banner text',
          text: 'SHOCKING NEWS!',
          fontFamily: 'Archivo Black',
          fontWeight: 400,
          fontSize: Math.round(70 * k),
          color: '#111111',
          align: 'center',
          lineHeight: 1,
          x: margin(w),
          y: Math.round((bar - 70 * k) / 2),
          width: w - margin(w) * 2,
          height: Math.round(70 * k),
          noWrap: true,
          groupId,
        }),
      ]
    },
  },
  {
    id: 'footer-line',
    label: 'Footer line',
    group: 'Labels',
    hint: 'A thin, spaced line along the bottom: your site and a tagline.',
    build: (w, h) => {
      const k = fit(w, h)
      const size = Math.round(18 * k)
      return [
        plain({
          name: 'Footer',
          text: 'YOURSITE.COM  |  EMPOWERING YOUR AUDIENCE',
          fontWeight: 600,
          fontSize: size,
          letterSpacing: Math.round(3 * k),
          color: '#cbd5e1',
          align: 'right',
          x: margin(w),
          y: Math.round(h - h * 0.04 - size * 2),
          width: w - margin(w) * 2,
          height: Math.round(size * 1.4),
          noWrap: true,
        }),
      ]
    },
  },
  {
    id: 'corner-tag',
    label: 'Corner tag',
    group: 'Labels',
    hint: 'A small, quiet label in a corner — "AI-generated", "Sponsored", a credit.',
    build: (w, h) => {
      const k = fit(w, h)
      const width = Math.round(220 * k)
      return [
        plain({
          name: 'Corner tag',
          text: 'AI-generated',
          fontWeight: 600,
          fontSize: Math.round(20 * k),
          color: '#ffffff',
          opacity: 75,
          align: 'right',
          x: w - margin(w) - width,
          y: Math.round(h * 0.04),
          width,
          height: Math.round(28 * k),
          noWrap: true,
        }),
      ]
    },
  },
  {
    id: 'tweet-card',
    label: 'Tweet card',
    group: 'Cards',
    hint: 'A round photo, a name and @handle, then the post — select the circle and upload to fill it.',
    build: (w, h) => {
      const k = fit(w, h)
      const groupId = newId('g')
      const avatar = Math.round(130 * k)
      const x = margin(w) + Math.round(40 * k)
      const top = Math.round(h * 0.3)
      const nameX = x + avatar + Math.round(36 * k)
      return [
        createImage('', avatar, avatar, w, h, {
          name: 'Avatar',
          x,
          y: top,
          width: avatar,
          height: avatar,
          cornerRadius: avatar / 2,
          groupId,
        }),
        plain({
          name: 'Name',
          text: 'Your Name',
          fontSize: Math.round(40 * k),
          x: nameX,
          y: top + Math.round(26 * k),
          width: w - nameX - margin(w),
          height: Math.round(48 * k),
          noWrap: true,
          groupId,
        }),
        plain({
          name: 'Handle',
          text: '@yourhandle',
          fontWeight: 400,
          fontSize: Math.round(30 * k),
          color: '#9ca3af',
          x: nameX,
          y: top + Math.round(80 * k),
          width: w - nameX - margin(w),
          height: Math.round(36 * k),
          noWrap: true,
          groupId,
        }),
        plain({
          name: 'Post',
          text: TWEET,
          fontWeight: 400,
          fontSize: Math.round(40 * k),
          lineHeight: 1.3,
          x,
          y: top + avatar + Math.round(70 * k),
          width: w - x - margin(w),
          height: Math.round(200 * k),
          accents: [accentOn(TWEET, 'Full Stack', '#22c55e'), accentOn(TWEET, 'Half Stack', '#ef4444')],
          groupId,
        }),
      ]
    },
  },
  {
    id: 'quote',
    label: 'Quote',
    group: 'Cards',
    hint: 'A pull quote with its attribution underneath.',
    build: (w, h) => {
      const k = fit(w, h)
      const groupId = newId('g')
      const text = '“Being good at your job should be rewarded, not punished with more work.”'
      return [
        plain({
          name: 'Quote',
          text,
          fontFamily: 'Montserrat',
          fontWeight: 900,
          fontSize: Math.round(58 * k),
          lineHeight: 1.18,
          x: margin(w),
          y: Math.round(h * 0.3),
          width: w - margin(w) * 2,
          height: Math.round(300 * k),
          accents: [accentOn(text, 'rewarded', '#facc15')],
          groupId,
        }),
        plain({
          name: 'Attribution',
          text: '— Your Name, Founder',
          fontWeight: 600,
          fontSize: Math.round(30 * k),
          color: '#cbd5e1',
          x: margin(w),
          y: Math.round(h * 0.3 + 330 * k),
          width: w - margin(w) * 2,
          height: Math.round(40 * k),
          groupId,
        }),
      ]
    },
  },
  {
    id: 'band-headline',
    label: 'Band headline',
    group: 'Captions',
    hint: 'A black band across a photo with the headline inside it, for a busy or blurred picture.',
    build: (w, h) => {
      const k = fit(w, h)
      const groupId = newId('g')
      const bandH = Math.round(h * 0.3)
      const bandY = Math.round((h - bandH) / 2)
      const text = 'Has a ₹1.5 lakh salary become the new ₹15,000?'
      return [
        createShape({ name: 'Band', shape: 'rect', x: 0, y: bandY, width: w, height: bandH, fill: '#000000', opacity: 88, cornerRadius: 0, groupId }),
        plain({
          name: 'Band text',
          text,
          fontWeight: 900,
          fontSize: Math.round(64 * k),
          align: 'center',
          lineHeight: 1.2,
          x: margin(w),
          y: bandY + Math.round(bandH * 0.18),
          width: w - margin(w) * 2,
          height: Math.round(bandH * 0.64),
          accents: [accentOn(text, '₹1.5 lakh', '#facc15'), accentOn(text, '₹15,000?', '#facc15')],
          groupId,
        }),
      ]
    },
  },
  {
    id: 'meme-caption',
    label: 'Meme caption',
    group: 'Captions',
    hint: 'White caption with a heavy black outline — readable on any picture.',
    build: (w, h) => {
      const k = fit(w, h)
      return [
        plain({
          name: 'Caption',
          text: "They're the same picture.",
          fontFamily: 'Inter',
          fontWeight: 700,
          fontSize: Math.round(58 * k),
          align: 'center',
          strokeColor: '#000000',
          strokeWidth: Math.round(5 * k),
          x: margin(w),
          y: Math.round(h * 0.82),
          width: w - margin(w) * 2,
          height: Math.round(80 * k),
          effects: fx({ shadow: { enabled: true, color: '#000000', blur: 10, offsetX: 0, offsetY: 3, opacity: 70 } }),
        }),
      ]
    },
  },
]

// ------------------------------------------------------------- text shadows

export interface TextShadowStyle {
  id: string
  label: string
  hint: string
  /** Replaces these effects on the layer; effects it does not name are switched off. */
  effects: Pick<Partial<Effects>, 'shadow' | 'outline' | 'glow'>
}

/**
 * The shadows that make type readable over a photo, softest first. Applied to
 * whatever is selected, since an icon or a cut-out needs the same lift.
 */
export const TEXT_SHADOWS: TextShadowStyle[] = [
  { id: 'none', label: 'None', hint: 'Remove shadow, outline and glow', effects: {} },
  {
    id: 'soft',
    label: 'Soft',
    hint: 'A faint drop shadow — the news-card default',
    effects: { shadow: { enabled: true, color: '#000000', blur: 16, offsetX: 0, offsetY: 4, opacity: 55 } },
  },
  {
    id: 'lifted',
    label: 'Lifted',
    hint: 'A deeper shadow that lifts the text off a light photo',
    effects: { shadow: { enabled: true, color: '#000000', blur: 32, offsetX: 0, offsetY: 14, opacity: 85 } },
  },
  {
    id: 'halo',
    label: 'Halo',
    hint: 'A dark glow all round — for text over a busy picture',
    effects: { shadow: { enabled: true, color: '#000000', blur: 28, offsetX: 0, offsetY: 0, opacity: 95 } },
  },
  {
    id: 'hard',
    label: 'Hard',
    hint: 'A solid offset copy, no blur',
    effects: { shadow: { enabled: true, color: '#000000', blur: 0, offsetX: 6, offsetY: 6, opacity: 100 } },
  },
  {
    id: 'meme',
    label: 'Meme',
    hint: 'A heavy black outline with a soft shadow under it',
    effects: {
      outline: { enabled: true, color: '#000000', width: 6 },
      shadow: { enabled: true, color: '#000000', blur: 10, offsetX: 0, offsetY: 3, opacity: 70 },
    },
  },
]

/** A layer's effects with one shadow style applied: what it names replaces, the rest of shadow/outline/glow turns off. */
export function withShadowStyle(effects: Effects, style: TextShadowStyle): Effects {
  return {
    ...effects,
    shadow: { ...effects.shadow, enabled: false, ...style.effects.shadow },
    outline: { ...effects.outline, enabled: false, ...style.effects.outline },
    glow: { ...effects.glow, enabled: false, ...style.effects.glow },
  }
}

/**
 * Where a darkening scrim belongs in the stack: just above the topmost photo,
 * under every word — a shadow added on top of the text would darken the text
 * it exists to make readable.
 */
export function scrimIndex(objects: SceneObject[]): number {
  let index = 0
  objects.forEach((o, i) => {
    if (o.type === 'image' && !o.icon) index = i + 1
  })
  return index
}

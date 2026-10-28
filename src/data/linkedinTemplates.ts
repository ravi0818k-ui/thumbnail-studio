import type { TemplateDef } from './templates'
import type { Background, Effects, SceneObject, TextObject } from '../types'
import { DEFAULT_ADJUSTMENTS, DEFAULT_BACKGROUND, DEFAULT_EFFECTS, DEFAULT_FADE } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import { TEXT_PARTS, accentOn, fit } from './textCollection'

// ---------------------------------------------------------------------------
// LinkedIn post layouts: the minimal news card, the quote card, the meme. They
// share a grammar — one photo or two, a dark fade where the words go, a
// headline with one coloured phrase, a small kicker or label, a thin footer —
// so most of them are assembled from the text collection's parts rather than
// re-describing them.
//
// Written for 1080 × 1350 and scaled by the shorter fit, so a square or a
// landscape post keeps every word inside the frame.
// ---------------------------------------------------------------------------

const solid = (color: string): Background => ({ ...DEFAULT_BACKGROUND, kind: 'solid', color })

/** The deep violet a news card's photos fade into. */
const INK = '#140a2e'

const margin = (w: number) => Math.round(w * 0.06)

function photo(x: number, y: number, width: number, height: number, name = 'Photo') {
  return createImage('', width, height, width, height, {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    name,
  })
}

function shadowFx(blur: number, offsetY: number, opacity: number): Effects {
  return {
    ...JSON.parse(JSON.stringify(DEFAULT_EFFECTS)),
    shadow: { enabled: true, color: '#000000', blur, offsetX: 0, offsetY, opacity },
  }
}

function sans(partial: Partial<TextObject>): TextObject {
  return createText({
    fontFamily: 'Inter',
    fontWeight: 700,
    uppercase: false,
    strokeWidth: 0,
    lineHeight: 1.2,
    color: '#ffffff',
    ...partial,
  })
}

/**
 * The fade that makes a headline readable over the bottom of a photo. It ends
 * where the photo ends, fully solid there and in the page's own colour, so the
 * photo melts into the page instead of stopping at a visible edge. `midpoint`
 * pushes the dark further up when the words sit high on the photo.
 */
function bottomFade(w: number, top: number, bottom: number, color: string, midpoint = 45) {
  const y = Math.round(top)
  return createShape({
    name: 'Bottom shadow',
    shape: 'rect',
    x: 0,
    y,
    width: w,
    height: Math.round(bottom) - y,
    fill: color,
    cornerRadius: 0,
    fade: { ...DEFAULT_FADE, enabled: true, from: 'bottom', softness: 80, midpoint },
  })
}

function footer(w: number, h: number, text = 'YOURSITE.COM  |  YOUR TAGLINE HERE') {
  const k = fit(w, h)
  const size = Math.round(18 * k)
  return sans({
    name: 'Footer',
    text,
    fontWeight: 600,
    fontSize: size,
    letterSpacing: Math.round(3 * k),
    color: '#cbd5e1',
    align: 'right',
    x: margin(w),
    y: Math.round(h * 0.955 - size * 1.4),
    width: w - margin(w) * 2,
    height: Math.round(size * 1.4),
    noWrap: true,
  })
}

const part = (id: string, w: number, h: number): SceneObject[] => TEXT_PARTS.find((p) => p.id === id)!.build(w, h)

const NEWS = '"Being good at your job" is the biggest trap in corporate, says one creator. Better work earns more work, not better pay.'
const SHOCK = 'Your keyword goes first, then the rest of the story in two or three short lines anyone can read.'
const BILLBOARD = 'One number changes the story. 8,500 roles were retrained, and the new service brought in $1.4 billion.'
const HINDI_TOP = '“मेहनत का सम्मान ही असली तरक्की है”'
const HINDI = 'अच्छा काम करने वालों को ज़्यादा काम नहीं, बेहतर सैलरी और पहचान मिलनी चाहिए।'

export const LINKEDIN_TEMPLATES: TemplateDef[] = [
  {
    id: 'li-news-split',
    name: 'News · two photos',
    category: 'News',
    format: 'linkedin',
    build: (w, h) => {
      const k = fit(w, h)
      const m = margin(w)
      const logo = Math.round(110 * k)
      return {
        background: solid(INK),
        objects: [
          photo(0, 0, w / 2 - 2, h * 0.68, 'Left photo'),
          photo(w / 2 + 2, 0, w / 2 - 2, h * 0.68, 'Right photo'),
          bottomFade(w, h * 0.3, h * 0.68, INK),
          { ...photo(m, h * 0.04, logo, logo, 'Logo'), cornerRadius: Math.round(logo * 0.18) },
          sans({
            name: 'Kicker',
            text: '⚡ QUICK UPDATES',
            fontSize: Math.round(24 * k),
            letterSpacing: Math.round(3 * k),
            color: '#e5e7eb',
            x: m,
            y: Math.round(h * 0.6),
            width: Math.round(w * 0.6),
            height: Math.round(32 * k),
            noWrap: true,
          }),
          sans({
            name: 'Headline',
            text: NEWS,
            fontFamily: 'Poppins',
            fontSize: Math.round(48 * k),
            x: m,
            y: Math.round(h * 0.64),
            width: w - m * 2,
            height: Math.round(h * 0.26),
            accents: [accentOn(NEWS, '"Being good at your job"', '#a3e635'), accentOn(NEWS, 'not better pay.', '#a3e635')],
            effects: shadowFx(16, 4, 55),
          }),
          footer(w, h),
        ],
      }
    },
  },
  {
    id: 'li-news-banner',
    name: 'News · top banner',
    category: 'News',
    format: 'linkedin',
    build: (w, h) => {
      const k = fit(w, h)
      const m = margin(w)
      const bar = Math.round(140 * k)
      return {
        background: solid('#0a0a0a'),
        objects: [
          photo(0, bar, w, h * 0.62, 'Photo'),
          bottomFade(w, h * 0.38, bar + h * 0.62, '#0a0a0a'),
          createShape({ name: 'Banner bar', shape: 'rect', x: 0, y: 0, width: w, height: bar, fill: '#facc15', cornerRadius: 0 }),
          sans({
            name: 'Banner text',
            text: 'BIG NEWS!',
            fontFamily: 'Archivo Black',
            fontWeight: 400,
            fontSize: Math.round(70 * k),
            color: '#111111',
            align: 'center',
            lineHeight: 1,
            x: m,
            y: Math.round((bar - 70 * k) / 2),
            width: w - m * 2,
            height: Math.round(70 * k),
            noWrap: true,
          }),
          sans({
            name: 'Label',
            text: 'HEADLINE:',
            fontFamily: 'Oswald',
            fontSize: Math.round(44 * k),
            color: '#111111',
            bgEnabled: true,
            bgColor: '#facc15',
            bgPadding: Math.round(10 * k),
            bgRadius: Math.round(4 * k),
            x: m,
            y: Math.round(h * 0.64),
            width: Math.round(w * 0.4),
            height: Math.round(72 * k),
            noWrap: true,
          }),
          sans({
            name: 'Headline',
            text: SHOCK,
            fontSize: Math.round(48 * k),
            x: m,
            y: Math.round(h * 0.71),
            width: w - m * 2,
            height: Math.round(h * 0.22),
            accents: [accentOn(SHOCK, 'Your keyword', '#facc15')],
            effects: shadowFx(16, 4, 55),
          }),
        ],
      }
    },
  },
  {
    id: 'li-billboard',
    name: 'Photo + caption',
    category: 'Business',
    format: 'linkedin',
    build: (w, h) => {
      const k = fit(w, h)
      const m = margin(w)
      return {
        background: solid('#0f172a'),
        objects: [
          photo(0, 0, w, h, 'Background photo'),
          bottomFade(w, h * 0.38, h, '#000000', 58),
          sans({
            name: 'Headline',
            text: BILLBOARD,
            fontSize: Math.round(54 * k),
            lineHeight: 1.15,
            x: m,
            y: Math.round(h * 0.68),
            width: w - m * 2,
            height: Math.round(h * 0.26),
            accents: [accentOn(BILLBOARD, 'One number changes the story.', '#a3e635'), accentOn(BILLBOARD, '$1.4 billion.', '#a3e635')],
            effects: shadowFx(18, 4, 60),
          }),
        ],
      }
    },
  },
  {
    id: 'li-tweet',
    name: 'Tweet card',
    category: 'Quote',
    format: 'linkedin',
    build: (w, h) => ({ background: solid('#000000'), objects: part('tweet-card', w, h) }),
  },
  {
    id: 'li-band',
    name: 'Band over a blurred photo',
    category: 'News',
    format: 'linkedin',
    build: (w, h) => ({
      background: solid('#1f2937'),
      objects: [
        // Blur and dim are set on the empty slot, so they apply to whatever photo fills it.
        { ...photo(0, 0, w, h, 'Background photo'), adjustments: { ...DEFAULT_ADJUSTMENTS, blur: 30, brightness: -15 } },
        ...part('band-headline', w, h),
        ...part('corner-tag', w, h),
      ],
    }),
  },
  {
    id: 'li-meme',
    name: 'Two-panel meme',
    category: 'Meme',
    format: 'linkedin',
    build: (w, h) => {
      const k = fit(w, h)
      const m = margin(w)
      const meme = (name: string, text: string, y: number) => ({
        ...part('meme-caption', w, h)[0],
        name,
        text,
        fontSize: Math.round(44 * k),
        x: m,
        y: Math.round(y),
        width: w - m * 2,
        height: Math.round(110 * k),
      })
      return {
        background: solid('#ffffff'),
        objects: [
          photo(0, 0, w, h / 2 - 3, 'Top photo'),
          photo(0, h / 2 + 3, w, h / 2 - 3, 'Bottom photo'),
          meme('Top caption', 'Corporate needs you to find the differences between this picture and this picture.', h / 2 - 140 * k),
          meme('Bottom caption', "They're the same picture.", h * 0.94 - 110 * k),
        ],
      }
    },
  },
  {
    id: 'li-quote',
    name: 'Quote card',
    category: 'Quote',
    format: 'linkedin',
    build: (w, h) => {
      const k = fit(w, h)
      const m = margin(w)
      const avatar = Math.round(120 * k)
      return {
        background: solid('#111827'),
        objects: [
          createShape({ name: 'Accent bar', shape: 'rect', x: m, y: Math.round(h * 0.24), width: Math.round(90 * k), height: Math.round(10 * k), fill: '#facc15', cornerRadius: Math.round(5 * k) }),
          ...part('quote', w, h),
          { ...photo(m, h * 0.78, avatar, avatar, 'Your photo'), cornerRadius: avatar / 2 },
          footer(w, h, 'FOLLOW FOR MORE  |  YOUR NAME'),
        ],
      }
    },
  },
  {
    id: 'li-hindi-strip',
    name: 'Hindi news strip',
    category: 'News',
    format: 'linkedin',
    build: (w, h) => {
      const k = fit(w, h)
      const m = margin(w)
      const top = Math.round(h * 0.11)
      const strip = Math.round(h * 0.72)
      return {
        background: solid('#000000'),
        objects: [
          photo(0, top, w / 2 - 2, strip - top, 'Left photo'),
          photo(w / 2 + 2, top, w / 2 - 2, strip - top, 'Right photo'),
          createShape({ name: 'Top bar', shape: 'rect', x: 0, y: 0, width: w, height: top, fill: '#facc15', cornerRadius: 0 }),
          sans({
            name: 'Top line',
            text: HINDI_TOP,
            fontFamily: 'Noto Sans Devanagari',
            fontWeight: 800,
            fontSize: Math.round(44 * k),
            color: '#111111',
            align: 'center',
            lineHeight: 1.3,
            x: m,
            y: Math.round((top - 57 * k) / 2),
            width: w - m * 2,
            height: Math.round(57 * k),
            noWrap: true,
          }),
          sans({
            name: 'Headline',
            text: HINDI,
            fontFamily: 'Noto Sans Devanagari',
            fontWeight: 800,
            fontSize: Math.round(46 * k),
            align: 'center',
            lineHeight: 1.45,
            x: m,
            y: Math.round(strip + h * 0.03),
            width: w - m * 2,
            height: Math.round(h * 0.2),
            accents: [accentOn(HINDI, 'बेहतर सैलरी और पहचान', '#facc15')],
          }),
        ],
      }
    },
  },
]

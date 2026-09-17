import type { Background, ShapeObject, TextObject } from '../types'
import { DEFAULT_BACKGROUND } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import type { TemplateDef } from './templates'
import { ELEMENTS } from './elements'

// ---------------------------------------------------------------------------
// Vertical covers for YouTube Shorts (1080 × 1920).
//
// Every layout is built inside the safe area: the top row, the right-hand
// action rail and the bottom title block are left clear, so nothing important
// disappears behind YouTube's own interface. Headlines ship with Auto Fit on,
// so retyping the copy re-sizes the text instead of breaking the layout.
// ---------------------------------------------------------------------------

const W = 1080
const H = 1920

/** Content column: clear of the left margin and the right action rail. */
const COL = { x: 90, width: 810 }
/** Vertical band between the top chrome and the title block. */
const BAND = { top: 240, bottom: 1480 }

const INK = '#0B1120'
const WHITE = '#FFFFFF'
const YELLOW = '#FFD21F'
const RED = '#FF3B5C'
const GREEN = '#22C55E'
const BLUE = '#3B82F6'

const element = (id: string) => ELEMENTS.find((e) => e.id === id)!

function gradient(from: string, to: string, direction: Background['gradient']['direction'] = 'to-bottom'): Background {
  return { ...DEFAULT_BACKGROUND, kind: 'gradient', color: from, gradient: { from, to, direction } }
}

function pattern(kind: Background['pattern']['kind'], color: string, background: string, scale: number): Background {
  return { ...DEFAULT_BACKGROUND, kind: 'pattern', color: background, pattern: { kind, color, background, scale } }
}

function solid(color: string): Background {
  return { ...DEFAULT_BACKGROUND, kind: 'solid', color }
}

/** A centred line of copy in the content column. */
function line(content: string, y: number, size: number, over: Partial<TextObject> = {}): TextObject {
  return createText({
    name: content.split('\n')[0].slice(0, 22),
    text: content,
    x: COL.x,
    y,
    width: COL.width,
    height: Math.round(size * 1.15 * Math.max(1, content.split('\n').length)),
    fontFamily: 'Anton',
    fontWeight: 400,
    fontSize: size,
    color: WHITE,
    align: 'center',
    uppercase: true,
    lineHeight: 1.02,
    strokeWidth: 0,
    autoHeight: false,
    autoFit: 'width',
    ...over,
  })
}

/** A pill label — the small kicker above a headline. */
function pill(content: string, y: number, color: string, background: string, width = 460): (TextObject | ShapeObject)[] {
  const x = Math.round((W - width) / 2)
  return [
    createShape({
      name: 'Label pill',
      shape: 'roundRect',
      x,
      y,
      width,
      height: 90,
      cornerRadius: 45,
      fill: background,
      fillEnabled: true,
      strokeEnabled: false,
    }),
    createText({
      name: content,
      text: content,
      x: x + 20,
      y: y + 22,
      width: width - 40,
      height: 48,
      fontFamily: 'Montserrat',
      fontWeight: 900,
      fontSize: 40,
      color,
      align: 'center',
      uppercase: true,
      letterSpacing: 3,
      strokeWidth: 0,
      autoHeight: false,
      autoFit: 'width',
    }),
  ]
}

/** Creator cut-out slot, sized for the lower half of a vertical frame. */
function subject(y = 900, height = 900, name = 'Creator cut-out') {
  const width = Math.round(height * 0.72)
  return createImage('', width, height, W, H, {
    x: Math.round((W - width) / 2),
    y,
    width,
    height,
    name,
    effects: {
      shadow: { enabled: true, color: '#000000', blur: 40, offsetX: 0, offsetY: 18, opacity: 45 },
      outline: { enabled: true, color: WHITE, width: 8 },
      glow: { enabled: false, color: WHITE, blur: 30, intensity: 2 },
      overlay: { enabled: false, color: RED, opacity: 30 },
    },
  })
}

function card(x: number, y: number, width: number, height: number, over: Partial<ShapeObject> = {}): ShapeObject {
  return createShape({
    name: 'Card',
    shape: 'roundRect',
    x,
    y,
    width,
    height,
    cornerRadius: 28,
    fill: 'rgba(255,255,255,0.08)',
    fillEnabled: true,
    stroke: 'rgba(255,255,255,0.25)',
    strokeEnabled: true,
    strokeWidth: 3,
    ...over,
  })
}

function numberedRow(index: number, y: number, title: string, accent = YELLOW): (TextObject | ShapeObject)[] {
  return [
    createShape({
      name: `Step ${index}`,
      shape: 'ellipse',
      x: COL.x,
      y,
      width: 96,
      height: 96,
      fill: accent,
      fillEnabled: true,
      strokeEnabled: false,
    }),
    createText({
      name: `${index}`,
      text: String(index),
      x: COL.x,
      y: y + 22,
      width: 96,
      height: 56,
      fontFamily: 'Anton',
      fontSize: 52,
      color: INK,
      align: 'center',
      strokeWidth: 0,
      autoHeight: false,
    }),
    createText({
      name: title,
      text: title,
      x: COL.x + 132,
      y: y + 16,
      width: COL.width - 132,
      height: 64,
      fontFamily: 'Montserrat',
      fontWeight: 900,
      fontSize: 54,
      color: WHITE,
      align: 'left',
      uppercase: true,
      strokeWidth: 0,
      autoHeight: false,
      autoFit: 'width',
    }),
  ]
}

export const SHORTS_TEMPLATES: TemplateDef[] = [
  {
    id: 'shorts-big-text',
    name: 'Big text',
    category: 'Motivation',
    format: 'shorts',
    build: () => ({
      background: gradient('#1F2937', '#05070C'),
      objects: [
        ...pill('WATCH THIS', BAND.top, INK, YELLOW),
        line('STOP\nMAKING\nEXCUSES', 420, 190, { color: WHITE }),
        line('START NOW', 1240, 96, { color: YELLOW }),
        createShape({
          name: 'Underline',
          shape: 'roundRect',
          x: 340,
          y: 1370,
          width: 400,
          height: 14,
          cornerRadius: 7,
          fill: YELLOW,
          fillEnabled: true,
          strokeEnabled: false,
        }),
      ],
    }),
  },
  {
    id: 'shorts-face-text',
    name: 'Face + text',
    category: 'Personal Brand',
    format: 'shorts',
    build: () => ({
      background: gradient('#312E81', '#0B0620', 'radial'),
      objects: [
        subject(880, 880),
        line('THE TRICK\nNOBODY\nTOLD YOU', BAND.top + 40, 150),
        ...pill('60 SECONDS', 1330, INK, WHITE, 420),
      ],
    }),
  },
  {
    id: 'shorts-educational',
    name: 'Interview questions',
    category: 'Education',
    format: 'shorts',
    build: () => ({
      background: gradient('#0F172A', '#020617'),
      objects: [
        line('JAVASCRIPT', BAND.top, 128, { color: YELLOW }),
        line('INTERVIEW\nQUESTIONS', 420, 150),
        subject(820, 800),
        line('2026', 1360, 110, { color: YELLOW }),
      ],
    }),
  },
  {
    id: 'shorts-tutorial',
    name: 'How to',
    category: 'Tutorial',
    format: 'shorts',
    build: () => ({
      background: gradient('#0EA5E9', '#082F49'),
      objects: [
        line('HOW TO', BAND.top, 104, { color: '#BAE6FD' }),
        line('MASTER\nREACT', 400, 176),
        subject(860, 820),
        ...pill('5 MIN', 1350, INK, YELLOW, 340),
      ],
    }),
  },
  {
    id: 'shorts-before-after',
    name: 'Before / after',
    category: 'Fitness',
    format: 'shorts',
    build: () => ({
      background: gradient('#111827', '#030712'),
      objects: [
        line('30 DAYS', BAND.top, 120, { color: YELLOW }),
        card(COL.x, 400, COL.width, 420),
        createText({
          name: 'BEFORE',
          text: 'BEFORE',
          x: COL.x,
          y: 430,
          width: COL.width,
          height: 60,
          fontFamily: 'Montserrat',
          fontWeight: 900,
          fontSize: 46,
          color: '#94A3B8',
          align: 'center',
          uppercase: true,
          strokeWidth: 0,
          autoHeight: false,
        }),
        createShape({
          ...{ name: 'Arrow down', shape: 'path' as const, pathData: element('arrow-down').path!, fill: BLUE, fillEnabled: true, strokeEnabled: false },
          x: 470,
          y: 850,
          width: 140,
          height: 140,
        }),
        card(COL.x, 1020, COL.width, 420, { stroke: GREEN, fill: 'rgba(34,197,94,0.12)' }),
        createText({
          name: 'AFTER',
          text: 'AFTER',
          x: COL.x,
          y: 1050,
          width: COL.width,
          height: 60,
          fontFamily: 'Montserrat',
          fontWeight: 900,
          fontSize: 46,
          color: GREEN,
          align: 'center',
          uppercase: true,
          strokeWidth: 0,
          autoHeight: false,
        }),
      ],
    }),
  },
  {
    id: 'shorts-question',
    name: 'Question',
    category: 'Facts',
    format: 'shorts',
    build: () => ({
      background: gradient('#7C3AED', '#12082B', 'radial'),
      objects: [
        createShape({
          name: 'Question mark',
          shape: 'path',
          pathData: element('question').path!,
          x: 430,
          y: BAND.top,
          width: 220,
          height: 220,
          fill: YELLOW,
          fillEnabled: true,
          strokeEnabled: false,
        }),
        line('CAN YOU\nSOLVE\nTHIS?', 540, 168),
        subject(1000, 700),
      ],
    }),
  },
  {
    id: 'shorts-steps',
    name: 'Step by step',
    category: 'Coding',
    format: 'shorts',
    build: () => ({
      background: pattern('grid', '#1E293B', '#050A14', 60),
      objects: [
        line('DEBUG\nANYTHING', BAND.top, 150),
        ...numberedRow(1, 720, 'Read the error'),
        ...numberedRow(2, 880, 'Log the input'),
        ...numberedRow(3, 1040, 'Bisect the code'),
        ...pill('FULL GUIDE', 1260, INK, YELLOW, 460),
      ],
    }),
  },
  {
    id: 'shorts-top-five',
    name: 'Top 5',
    category: 'Technology',
    format: 'shorts',
    build: () => ({
      background: gradient('#0B1120', '#1E3A8A', 'to-bottom'),
      objects: [
        ...pill('RANKED', BAND.top, WHITE, RED, 380),
        line('TOP 5\nAI TOOLS', 380, 168),
        ...numberedRow(1, 780, 'For writing', '#60A5FA'),
        ...numberedRow(2, 930, 'For research', '#60A5FA'),
        ...numberedRow(3, 1080, 'For coding', '#60A5FA'),
        line('…and 2 more', 1270, 64, { fontFamily: 'Poppins', fontWeight: 700, uppercase: false, color: '#BFDBFE' }),
      ],
    }),
  },
  {
    id: 'shorts-mistake',
    name: 'Mistake',
    category: 'Business',
    format: 'shorts',
    build: () => ({
      background: gradient('#450A0A', '#0B0303'),
      objects: [
        createShape({
          name: 'Cross',
          shape: 'path',
          pathData: element('cross').path!,
          x: 470,
          y: BAND.top,
          width: 140,
          height: 140,
          fill: RED,
          fillEnabled: true,
          strokeEnabled: false,
        }),
        line('THE #1\nMISTAKE', 440, 170),
        line('everyone makes\nin their first year', 820, 64, {
          fontFamily: 'Poppins',
          fontWeight: 700,
          uppercase: false,
          color: '#FCA5A5',
        }),
        subject(1000, 700),
      ],
    }),
  },
  {
    id: 'shorts-secret',
    name: 'Secret',
    category: 'Finance',
    format: 'shorts',
    build: () => ({
      background: gradient('#022C22', '#010A07', 'radial'),
      objects: [
        ...pill('NOBODY TELLS YOU', BAND.top, INK, GREEN, 620),
        line('THE\nMONEY\nSECRET', 420, 180, { color: WHITE }),
        line('$0 → $10K', 1100, 120, { color: GREEN }),
        subject(1180, 300, 'Small cut-out'),
      ],
    }),
  },
  {
    id: 'shorts-did-you-know',
    name: 'Did you know?',
    category: 'Facts',
    format: 'shorts',
    build: () => ({
      background: gradient('#1E1B4B', '#05030F'),
      objects: [
        line('DID YOU\nKNOW?', BAND.top, 150, { color: YELLOW }),
        card(COL.x, 700, COL.width, 520),
        line('Your brain uses\n20% of your\nenergy', 760, 88, {
          fontFamily: 'Poppins',
          fontWeight: 700,
          uppercase: false,
        }),
        ...pill('PART 1', 1300, INK, WHITE, 340),
      ],
    }),
  },
  {
    id: 'shorts-warning',
    name: 'Warning',
    category: 'News',
    format: 'shorts',
    build: () => ({
      background: solid('#0B0B0B'),
      objects: [
        createShape({
          name: 'Alert bar',
          shape: 'rect',
          x: 0,
          y: 560,
          width: W,
          height: 360,
          fill: RED,
          fillEnabled: true,
          strokeEnabled: false,
        }),
        ...pill('WARNING', BAND.top, INK, YELLOW, 460),
        line('DELETE\nTHIS APP', 600, 170, { color: WHITE }),
        line('before it drains\nyour battery', 1000, 68, {
          fontFamily: 'Poppins',
          fontWeight: 700,
          uppercase: false,
          color: '#FCA5A5',
        }),
        subject(1180, 300, 'Small cut-out'),
      ],
    }),
  },
  {
    id: 'shorts-result',
    name: 'Result',
    category: 'Reaction',
    format: 'shorts',
    build: () => ({
      background: gradient('#0F172A', '#020617', 'radial'),
      objects: [
        ...pill('I TRIED IT', BAND.top, INK, YELLOW, 420),
        line('7 DAYS\nLATER', 400, 168),
        card(COL.x, 800, COL.width, 320, { fill: 'rgba(34,197,94,0.14)', stroke: GREEN }),
        line('+412%', 860, 150, { color: GREEN }),
        line('honest results inside', 1240, 60, {
          fontFamily: 'Poppins',
          fontWeight: 700,
          uppercase: false,
          color: '#CBD5E1',
        }),
      ],
    }),
  },
]

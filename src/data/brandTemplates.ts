import type { SceneObject, ShapeObject, TextObject } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import type { TemplateDef } from './templates'
import {
  BACKGROUNDS,
  CUTOUT_EFFECTS,
  ELEMENT_STYLES,
  INK,
  PHOTO_ADJUSTMENTS,
  TEXT_STYLES,
  WHITE,
  YELLOW,
} from './brand'

// ---------------------------------------------------------------------------
// Brand 2 layouts. Every object is built from the brand styles above, so
// the templates cannot drift away from the design system.
// ---------------------------------------------------------------------------

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const background = (id: string) => clone(BACKGROUNDS.find((b) => b.id === id)!.value)

function text(styleId: string, content: string, x: number, y: number, w: number, h: number, over: Partial<TextObject> = {}) {
  const style = TEXT_STYLES.find((s) => s.id === styleId)!
  return createText({
    ...clone(style.apply),
    name: content.split('\n')[0].slice(0, 22) || style.label,
    text: content,
    x,
    y,
    width: w,
    height: h,
    autoHeight: false,
    ...over,
  })
}

function shape(elementId: string, x: number, y: number, w: number, h: number, over: Partial<ShapeObject> = {}) {
  const element = ELEMENT_STYLES.find((e) => e.id === elementId)!
  return createShape({
    ...clone(element.apply),
    name: element.label,
    x,
    y,
    width: w,
    height: h,
    ...over,
  })
}

/** An empty slot for the creator cut-out, pre-styled with the brand treatment. */
function photo(x: number, y: number, w: number, h: number, name = 'Creator cut-out') {
  return createImage('', w, h, 1280, 720, {
    x,
    y,
    width: w,
    height: h,
    name,
    effects: clone(CUTOUT_EFFECTS),
    adjustments: { ...PHOTO_ADJUSTMENTS },
  })
}

/** Grey "messy notes" rules used in the before / after layouts. */
function rules(x: number, y: number, widths: number[], gap = 34, color = '#D8DEE7'): ShapeObject[] {
  return widths.map((w, i) =>
    createShape({
      name: 'Line',
      shape: 'roundRect',
      x,
      y: y + i * gap,
      width: w,
      height: 12,
      cornerRadius: 6,
      fill: color,
      fillEnabled: true,
      strokeEnabled: false,
    }),
  )
}

/** A green check with its caption, as used inside the note cards. */
function checkRow(x: number, y: number, caption: string, color?: string): SceneObject[] {
  return [
    shape('check', x, y + 4, 26, 26),
    text('support', caption, x + 40, y, 210, 36, { fontSize: 28, lineHeight: 1.1, ...(color ? { color } : {}) }),
  ]
}

export const BRAND_TEMPLATES: TemplateDef[] = [
  {
    id: 'ranjan-gemini-notes',
    name: 'AI Notes (flagship)',
    category: 'Brand 2',
    build: () => ({
      background: background('paper-texture'),
      objects: [
        photo(36, 80, 440, 640),
        text('hook', 'GEMINI AI', 500, 64, 700, 118, { fontSize: 108 }),
        shape('marker', 496, 188, 330, 110),
        text('hook', 'NOTES', 506, 200, 310, 90, { fontSize: 92, align: 'center' }),

        shape('card', 500, 330, 290, 200),
        text('label', 'PLAIN NOTES', 520, 350, 250, 30, { color: '#8A96A6' }),
        ...rules(520, 398, [250, 230, 180]),

        shape('arrow-blue', 806, 392, 100, 100),

        shape('card', 926, 318, 286, 224),
        text('label', 'AI NOTES', 946, 338, 246, 30),
        ...checkRow(946, 384, 'Key points'),
        ...checkRow(946, 428, 'Mind map'),
        ...checkRow(946, 472, 'Exam tip'),

        shape('brush', 500, 556, 440, 92),
        text('brush-label', 'WORKS FOR\nCBSE BOARDS & UPSC', 520, 574, 400, 60, { fontSize: 30 }),

        text('annotation', 'Study smarter\nwith AI', 980, 560, 232, 90, { fontSize: 38 }),
      ],
    }),
  },
  {
    id: 'ranjan-before-after',
    name: 'Before → After notes',
    category: 'Brand 2',
    build: () => ({
      background: background('white'),
      objects: [
        text('hook', 'FIX YOUR NOTES', 64, 64, 760, 118, { fontSize: 104 }),
        shape('underline', 64, 186, 300, 38),

        shape('card', 64, 250, 470, 350, { fill: '#F1F3F6', stroke: '#C9D2DE' }),
        text('label', 'BEFORE', 92, 274, 200, 30, { color: '#8A96A6' }),
        ...rules(92, 340, [400, 360, 410, 330], 48),

        shape('arrow-blue', 566, 380, 110, 110),

        shape('card', 710, 232, 506, 386),
        text('label', 'AFTER', 742, 258, 200, 30),
        ...checkRow(742, 310, 'Structured summary'),
        ...checkRow(742, 364, 'Mind map'),
        ...checkRow(742, 418, 'Key formulas'),
        ...checkRow(742, 472, 'Revision in 10 min'),
        shape('marker', 742, 528, 240, 64),
        text('label', 'SAME NOTES', 752, 548, 220, 30, { align: 'center', fontSize: 26 }),

        text('annotation', 'one prompt →', 566, 506, 150, 50, { fontSize: 34 }),
      ],
    }),
  },
  {
    id: 'ranjan-hook',
    name: 'Big hook + creator',
    category: 'Brand 2',
    build: () => ({
      background: background('blue-wash'),
      objects: [
        photo(690, 60, 560, 660),
        text('hook', 'STOP', 64, 96, 420, 150, { fontSize: 140 }),
        shape('marker', 58, 252, 500, 132),
        text('hook', 'FORGETTING', 70, 276, 476, 90, { fontSize: 80, align: 'center' }),
        text('support', 'Three memory systems that\nactually stick — with examples.', 66, 406, 520, 120, { fontSize: 40 }),
        shape('brush', 64, 552, 380, 96),
        text('brush-label', 'WATCH TILL THE END', 78, 582, 352, 40, { fontSize: 30 }),
        shape('arrow-yellow', 560, 430, 96, 96, { rotation: -18 }),
      ],
    }),
  },
  {
    id: 'ranjan-problem-solution',
    name: 'Problem → Solution',
    category: 'Brand 2',
    build: () => ({
      background: background('paper'),
      objects: [
        photo(40, 130, 380, 590),
        text('hook', 'FIX YOUR MEMORY', 420, 64, 796, 118, { fontSize: 100 }),

        shape('panel', 440, 196, 330, 208),
        text('label', 'THE PROBLEM', 466, 222, 280, 28, { color: YELLOW }),
        text('support', 'You forget 80%\nof what you read\nwithin 7 days.', 466, 266, 290, 120, { fontSize: 36, color: WHITE }),

        shape('arrow-blue', 790, 256, 90, 90),

        shape('card', 894, 190, 322, 220),
        text('label', 'THE FIX', 920, 214, 260, 28),
        ...checkRow(920, 258, 'Spaced revision'),
        ...checkRow(920, 302, 'Active recall'),
        ...checkRow(920, 346, 'AI summaries'),

        shape('marker', 440, 448, 330, 96),
        text('hook', '7 DAY PLAN', 452, 470, 306, 60, { fontSize: 54, align: 'center' }),
        text('annotation', 'free template in\nthe description', 810, 460, 260, 100, { fontSize: 36, color: INK }),
      ],
    }),
  },
  {
    id: 'ranjan-three-cards',
    name: 'Three-card breakdown',
    category: 'Brand 2',
    build: () => ({
      background: background('grid-note'),
      objects: [
        text('hook', 'STUDY SMARTER', 64, 64, 1152, 118, { fontSize: 106, align: 'center' }),
        shape('underline', 490, 186, 300, 40),

        shape('card', 64, 244, 350, 300),
        text('label', 'STEP 01', 96, 272, 200, 28, { color: '#8A96A6' }),
        text('explain', 'CAPTURE', 96, 312, 290, 70, { fontSize: 56 }),
        text('support', 'Dump everything into\none place, fast.', 96, 392, 290, 90, { fontSize: 32 }),
        ...checkRow(96, 486, 'No formatting'),

        shape('card', 465, 244, 350, 300),
        text('label', 'STEP 02', 497, 272, 200, 28, { color: '#8A96A6' }),
        text('explain', 'STRUCTURE', 497, 312, 290, 70, { fontSize: 56 }),
        text('support', 'Let AI turn it into\nheadings and points.', 497, 392, 290, 90, { fontSize: 32 }),
        ...checkRow(497, 486, 'One prompt'),

        shape('card', 866, 244, 350, 300),
        text('label', 'STEP 03', 898, 272, 200, 28, { color: '#8A96A6' }),
        text('explain', 'REVISE', 898, 312, 290, 70, { fontSize: 56 }),
        text('support', 'Ten minutes before\nthe exam.', 898, 392, 290, 90, { fontSize: 32 }),
        ...checkRow(898, 486, 'Spaced recall'),

        shape('brush', 440, 578, 400, 74),
        text('brush-label', 'FULL SYSTEM INSIDE', 456, 596, 368, 40, { fontSize: 30, color: WHITE }),
      ],
    }),
  },
  {
    id: 'ranjan-dark',
    name: 'Navy statement',
    category: 'Brand 2',
    build: () => ({
      background: background('navy'),
      objects: [
        photo(720, 70, 520, 650),
        text('hook-light', 'YOUR NOTES', 64, 120, 620, 120, { fontSize: 106 }),
        shape('marker', 60, 244, 560, 130),
        text('hook', 'ARE BROKEN', 72, 268, 536, 90, { fontSize: 82, align: 'center' }),
        text('support', 'Here is the system I use\nbefore every exam.', 66, 400, 560, 110, { fontSize: 38, color: WHITE }),
        ...checkRow(66, 540, 'Free template inside', WHITE),
        shape('arrow-yellow', 626, 486, 88, 88, { rotation: -28 }),
      ],
    }),
  },
]

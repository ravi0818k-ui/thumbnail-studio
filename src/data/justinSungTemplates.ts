import type { Background, ShapeObject, TextObject } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import type { TemplateDef } from './templates'
import { CANVAS, JUSTIN_SUNG } from './justinSung'

// ---------------------------------------------------------------------------
// Brand 3 layouts. Every one is the same three moves in a different order:
// the photograph fills the frame, a black scrim gives the copy a ground, and
// one red mark points at the promise.
//
// The photo slot is left empty (`createImage('')`) so applying a layout drops
// your own still into it at full bleed.
// ---------------------------------------------------------------------------

const W = CANVAS.width
const H = CANVAS.height
const MARGIN = CANVAS.safeMargin

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const background = (id: string) => clone(JUSTIN_SUNG.backgrounds.find((b) => b.id === id)!.value) as Background

function text(styleId: string, content: string, x: number, y: number, w: number, h: number, over: Partial<TextObject> = {}) {
  const style = JUSTIN_SUNG.textStyles.find((s) => s.id === styleId)!
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

function element(elementId: string, x: number, y: number, w: number, h: number, over: Partial<ShapeObject> = {}) {
  const style = JUSTIN_SUNG.elementStyles.find((e) => e.id === elementId)!
  return createShape({
    ...clone(style.apply),
    name: style.label,
    x,
    y,
    width: w,
    height: h,
    ...over,
  })
}

/** The still, full bleed. Not a cut-out — the room is part of the picture. */
function photo() {
  return createImage('', W, H, W, H, {
    x: 0,
    y: 0,
    width: W,
    height: H,
    name: 'Photo (full bleed)',
    effects: clone(JUSTIN_SUNG.cutout.effects),
    adjustments: { ...JUSTIN_SUNG.photoAdjustments },
  })
}

export const JUSTIN_SUNG_TEMPLATES: TemplateDef[] = [
  {
    id: 'js-bottom-rule',
    name: 'Bottom line',
    category: 'Brand 3',
    format: 'thumbnail',
    build: () => ({
      background: background('black'),
      objects: [
        photo(),
        // The scrim only has to reach the lower third — the headline lives there.
        element('shadow-bottom', 0, 0, W, H, { name: 'Black shadow' }),
        element('underline', MARGIN, 604, W - MARGIN * 2, 34),
        text('hook', 'Outlearn everyone', MARGIN, 470, W - MARGIN * 2, 150),
      ],
    }),
  },
  {
    id: 'js-left-scrim',
    name: 'Left shadow',
    category: 'Brand 3',
    format: 'thumbnail',
    build: () => ({
      background: background('black'),
      objects: [
        photo(),
        element('shadow-left', 0, 0, W, H, { name: 'Black shadow' }),
        // "Think fast," is added first, so it is the headline the rules read.
        text('hook', 'Think fast,', MARGIN, 76, 620, 150, { fontSize: 128 }),
        text('hook', 'talk', MARGIN, 222, 230, 150, { fontSize: 128 }),
        text('keyword', 'smart', 268, 222, 330, 150, { fontSize: 128 }),
      ],
    }),
  },
  {
    id: 'js-angled',
    name: 'Angled shadow',
    category: 'Brand 3',
    format: 'thumbnail',
    build: () => ({
      background: background('black'),
      objects: [
        photo(),
        // The lean lives in the fade's angle, so the scrim is a plain
        // full-canvas rectangle and no corner can ever be left uncovered.
        element('shadow-wedge', 0, 0, W, H, { name: 'Black shadow' }),
        text('hook', 'The real\nproblem', MARGIN, 120, 560, 300, { fontSize: 134 }),
        element('underline', MARGIN, 436, 420, 26),
      ],
    }),
  },
  {
    id: 'js-plate',
    name: 'Red plate',
    category: 'Brand 3',
    format: 'thumbnail',
    build: () => ({
      background: background('black'),
      objects: [
        photo(),
        element('shadow-left', 0, 0, W, H, { name: 'Black shadow', fade: { enabled: true, from: 'left', softness: 48, midpoint: 52, angle: 90 } }),
        text('meta', 'STUDY SYSTEMS', MARGIN, 96, 400, 40),
        text('hook', 'Stop', MARGIN, 170, 260, 150, { fontSize: 140 }),
        text('keyword', 'cramming', MARGIN, 316, 560, 150, { fontSize: 140 }),
      ],
    }),
  },
]

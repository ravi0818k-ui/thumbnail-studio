import type { Background, ShapeObject, TextObject } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import type { TemplateDef } from './templates'
import { BLUE, INK, LAYOUT, LIGHT, MUTED, RED, VIVIAN, YELLOW } from './vivian'

// ---------------------------------------------------------------------------
// Vivian layouts. Every one of them: copy in the left 60%, the presenter at a
// third of the width on the right, one flat icon on the seam between them, one
// yellow keyword — and no fourth element. The gaps are the design.
// ---------------------------------------------------------------------------

const W = 1280
const H = 720
const MARGIN = VIVIAN.canvas.safeMargin
/** The copy column: from the margin to the 60% line. */
const COLUMN = Math.round(W * LAYOUT.textShare) - MARGIN

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const background = (id: string) => clone(VIVIAN.backgrounds.find((b) => b.id === id)!.value) as Background

function text(styleId: string, content: string, x: number, y: number, w: number, h: number, over: Partial<TextObject> = {}) {
  const style = VIVIAN.textStyles.find((s) => s.id === styleId)!
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
  const element = VIVIAN.elementStyles.find((e) => e.id === elementId)!
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

/**
 * The presenter, at 30–35% of the width on the right. Deliberately narrower
 * than the 40% subject zone: the strip it leaves is what the icon sits in.
 */
function presenter(x = 826, y = 56, w = 422, h = 664) {
  return createImage('', w, h, W, H, {
    x,
    y,
    width: w,
    height: h,
    name: 'Presenter cut-out',
    effects: clone(VIVIAN.cutout.effects),
    adjustments: { ...VIVIAN.photoAdjustments },
  })
}

/**
 * The single flat icon, empty until one is dropped in. Templates cannot
 * rasterise an Iconify icon — that needs a fetch — so this is a slot, and the
 * icon library fills it with a `tabler:` outline drawing.
 */
function iconSlot(x = 700, y = 130, size = 166) {
  return createImage('', size, size, W, H, {
    x,
    y,
    width: size,
    height: size,
    name: VIVIAN.iconSlot!.label,
  })
}

export const VIVIAN_TEMPLATES: TemplateDef[] = [
  {
    id: 'vivian-question',
    name: 'Question hook',
    category: 'Vivian',
    format: 'thumbnail',
    build: () => ({
      background: background('ink'),
      objects: [
        presenter(),
        text('hook', 'WHY YOU', MARGIN, 110, COLUMN, 140),
        text('keyword', 'FORGET', MARGIN, 258, 560, 176),
        text('support', 'The science behind fast\nforgetting — and the fix.', MARGIN, 456, 600, 104),
        shape('underline', MARGIN, 578, 220, 10),
        text('meta', 'SCIENCE  ·  REASONS  ·  FIXES', MARGIN, 606, 620, 36),
        iconSlot(),
      ],
    }),
  },
  {
    id: 'vivian-stop',
    name: 'Stop doing this',
    category: 'Vivian',
    format: 'thumbnail',
    build: () => ({
      background: background('ink-gradient'),
      objects: [
        presenter(846, 52, 402, 668),
        text('hook', 'STOP WASTING', MARGIN, 152, COLUMN, 140),
        text('keyword', 'TIME', MARGIN, 300, 400, 176),
        text('support', 'Three habits quietly stealing\nyour study hours.', MARGIN, 500, 600, 104),
        shape('underline', MARGIN, 626, 230, 10),
        iconSlot(694, 118, 156),
      ],
    }),
  },
  {
    id: 'vivian-promise',
    name: 'Numbered promise',
    category: 'Vivian',
    format: 'thumbnail',
    build: () => ({
      background: background('spotlight'),
      objects: [
        presenter(834, 58, 414, 662),
        shape('pill', MARGIN, 92, 226, 56),
        // Ink on the blue pill, tracked tighter than the standalone meta line
        // because it is set inside a fixed-width shape.
        text('meta', 'PROVEN METHOD', MARGIN + 18, 106, 190, 30, { color: INK, fontSize: 26, letterSpacing: 4 }),
        text('hook', '3 HABITS', MARGIN, 188, COLUMN, 140),
        text('keyword', 'THAT STICK', MARGIN, 336, 660, 176),
        text('meta', 'BACKED  ·  SIMPLE  ·  FREE', MARGIN, 556, 620, 36),
        iconSlot(688, 200, 160),
      ],
    }),
  },
  {
    id: 'vivian-mistake',
    name: 'Mistake / warning',
    category: 'Vivian',
    format: 'thumbnail',
    build: () => ({
      background: background('ink'),
      objects: [
        presenter(830, 54, 418, 666),
        text('hook', 'THE BIGGEST', MARGIN, 118, COLUMN, 140),
        text('keyword', 'MISTAKE', MARGIN, 266, 600, 176),
        shape('alert-bar', MARGIN, 466, 260, 10),
        // Set at the alert tier, which sits under the 55 px "prominent" line —
        // it qualifies the headline instead of competing with it.
        text('alert', 'EVERY LEARNER MAKES', MARGIN, 500, 660, 64),
        text('meta', 'AND HOW TO FIX IT', MARGIN, 592, 620, 36),
        iconSlot(692, 206, 158),
      ],
    }),
  },
]

/** Exported for the panel's swatch preview and the tests. */
export const VIVIAN_COLORS = { INK, LIGHT, YELLOW, BLUE, RED, MUTED }

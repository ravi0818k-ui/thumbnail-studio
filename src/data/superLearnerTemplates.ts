import type { Background, ShapeObject, TextObject } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import type { TemplateDef } from './templates'
import {
  BLUE,
  INK,
  LIGHT,
  MUTED,
  RED,
  SUPER_LEARNER,
  YELLOW,
} from './superLearner'

// ---------------------------------------------------------------------------
// Brand 1 layouts. All follow the guide's split: copy in the left 60%,
// creator plus one flat icon in the right 40%, and exactly one yellow keyword.
// ---------------------------------------------------------------------------

const W = 1280
const H = 720
/** Copy stays inside the left 60%; the creator and icon live to its right. */
const MARGIN = 56

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const background = (id: string) => clone(SUPER_LEARNER.backgrounds.find((b) => b.id === id)!.value) as Background

function text(styleId: string, content: string, x: number, y: number, w: number, h: number, over: Partial<TextObject> = {}) {
  const style = SUPER_LEARNER.textStyles.find((s) => s.id === styleId)!
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
  const element = SUPER_LEARNER.elementStyles.find((e) => e.id === elementId)!
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

/** Creator slot on the right 40%, with the brand's shadow-only treatment. */
function creator(x = 782, y = 76, w = 440, h = 644) {
  return createImage('', w, h, W, H, {
    x,
    y,
    width: w,
    height: h,
    name: 'Creator cut-out',
    effects: clone(SUPER_LEARNER.cutout.effects),
    adjustments: { ...SUPER_LEARNER.photoAdjustments },
  })
}

/**
 * The single flat icon. Left empty on purpose — drop in a Flaticon PNG/SVG and
 * credit the author, which the free licence requires.
 */
function iconSlot(x = 690, y = 214, size = 196) {
  return createImage('', size, size, W, H, {
    x,
    y,
    width: size,
    height: size,
    name: SUPER_LEARNER.iconSlot!.label,
  })
}

export const SUPER_LEARNER_TEMPLATES: TemplateDef[] = [
  {
    id: 'super-learner-why',
    name: 'Why / because hook',
    category: 'Brand 1',
    format: 'thumbnail',
    build: () => ({
      background: background('ink'),
      objects: [
        shape('backdrop', 744, 28, 508, 664),
        creator(),
        text('hook', 'WHY YOU', MARGIN, 96, 700, 140),
        text('keyword', 'FORGET', MARGIN, 240, 700, 176),
        text('hook', 'SO FAST?', MARGIN, 428, 700, 140),
        text('meta', 'SCIENCE  |  REASONS  |  SOLUTIONS', 60, 592, 660, 40),
        iconSlot(),
        shape('spark', 640, 168, 86, 78),
        shape('arrow', 772, 392, 104, 96, { rotation: 12 }),
        shape('note', 726, 500, 214, 142),
        text('note', "IT'S NOT\nYOUR FAULT", 742, 528, 182, 92, { rotation: -8 }),
      ],
    }),
  },
  {
    id: 'super-learner-stop',
    name: 'Stop doing this',
    category: 'Brand 1',
    format: 'thumbnail',
    build: () => ({
      background: background('ink-gradient'),
      objects: [
        creator(790, 60, 430, 660),
        text('hook', 'STOP WASTING', MARGIN, 150, 700, 140),
        text('keyword', 'TIME', MARGIN, 300, 460, 176),
        text('support', 'Three habits that quietly\nsteal your study hours.', 60, 502, 620, 110),
        shape('underline', MARGIN, 630, 240, 12),
        iconSlot(688, 96, 170),
        shape('spark', 660, 52, 76, 70),
      ],
    }),
  },
  {
    id: 'super-learner-number',
    name: 'Numbered promise',
    category: 'Brand 1',
    format: 'thumbnail',
    build: () => ({
      background: background('spotlight'),
      objects: [
        shape('backdrop', 748, 36, 500, 648),
        creator(786, 80, 432, 640),
        shape('pill', MARGIN, 92, 226, 60, { cornerRadius: 30 }),
        text('meta', 'PROVEN METHOD', 74, 108, 190, 32, { color: INK, fontSize: 26, letterSpacing: 4 }),
        text('hook', '3 HABITS', MARGIN, 186, 700, 140),
        text('keyword', 'THAT STICK', MARGIN, 336, 700, 176),
        text('meta', 'BACKED  |  SIMPLE  |  FREE', 60, 548, 620, 40),
        iconSlot(676, 214, 186),
        shape('arrow', 664, 430, 96, 92, { fill: BLUE, rotation: -8 }),
      ],
    }),
  },
  {
    id: 'super-learner-mistake',
    name: 'Mistake / warning',
    category: 'Brand 1',
    format: 'thumbnail',
    build: () => ({
      background: background('ink'),
      objects: [
        creator(788, 70, 434, 650),
        text('hook', 'THE BIGGEST', MARGIN, 122, 700, 140),
        text('keyword', 'MISTAKE', MARGIN, 272, 620, 176),
        shape('alert-bar', MARGIN, 470, 280, 12),
        // Below the 55 px "prominent" line on purpose: the headline carries the idea.
        text('alert', 'EVERY LEARNER MAKES', 60, 504, 660, 70, { fontSize: 52 }),
        text('meta', 'AND HOW TO FIX IT TODAY', 60, 596, 620, 40),
        iconSlot(682, 226, 180),
        shape('spark', 650, 178, 78, 72, { fill: RED }),
      ],
    }),
  },
  {
    id: 'super-learner-light',
    name: 'Light mode',
    category: 'Brand 1',
    format: 'thumbnail',
    build: () => ({
      background: background('light'),
      objects: [
        shape('backdrop', 744, 28, 508, 664, { fill: '#E4E4DE' }),
        creator(),
        text('hook-light', 'LEARN ANYTHING', MARGIN, 160, 700, 140),
        text('keyword', 'FASTER', MARGIN, 310, 480, 176),
        text('support', 'The 20-minute routine that\nbeats re-reading.', 60, 512, 620, 110, { color: '#6B7280' }),
        text('meta', 'STEP BY STEP', 60, 626, 420, 38, { color: '#6B7280' }),
        iconSlot(686, 120, 176),
        shape('spark', 656, 74, 78, 72),
      ],
    }),
  },
]

/** Exported for the panel's swatch preview and the tests. */
export const SUPER_LEARNER_COLORS = { INK, LIGHT, YELLOW, BLUE, RED, MUTED }

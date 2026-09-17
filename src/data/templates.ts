import type { Background, CanvasFormat, SceneObject } from '../types'
import { DEFAULT_BACKGROUND } from '../types'
import { createImage, createShape, createText } from '../engine/factory'
import { TEXT_PRESETS } from './textPresets'
import { ELEMENTS } from './elements'
import { BRAND_TEMPLATES } from './brandTemplates'
import { SHORTS_TEMPLATES } from './shortsTemplates'
import { SUPER_LEARNER_TEMPLATES } from './superLearnerTemplates'
import { JUSTIN_SUNG_TEMPLATES } from './justinSungTemplates'
import { VIVIAN_TEMPLATES } from './vivianTemplates'

export const TEMPLATE_CATEGORIES = [
  'All',
  'Brand 1',
  'Brand 2',
  'Brand 3',
  'Vivian',
  'Facts',
  'Fitness',
  'Reaction',
  'Coding',
  'Education',
  'Finance',
  'Gaming',
  'Technology',
  'Motivation',
  'News',
  'Business',
  'Tutorial',
  'Personal Brand',
] as const

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]

export interface TemplateDef {
  id: string
  name: string
  category: Exclude<TemplateCategory, 'All'>
  /** Which product the layout is designed for; defaults to the horizontal one. */
  format?: CanvasFormat
  /** Brand preset this layout belongs to, if any. */
  brand?: string
  build: (width: number, height: number) => { background: Background; objects: SceneObject[] }
}

export function templatesForFormat(format: CanvasFormat): TemplateDef[] {
  return TEMPLATES.filter((t) => (t.format ?? 'thumbnail') === format)
}

export function templatesForBrand(brand: string): TemplateDef[] {
  return TEMPLATES.filter((t) => t.brand === brand)
}

const preset = (id: string) => TEXT_PRESETS.find((p) => p.id === id)!.apply
const element = (id: string) => ELEMENTS.find((e) => e.id === id)!

function gradientBg(from: string, to: string, direction: Background['gradient']['direction'] = 'to-bottom-right'): Background {
  return { ...DEFAULT_BACKGROUND, kind: 'gradient', color: from, gradient: { from, to, direction } }
}

function patternBg(kind: Background['pattern']['kind'], color: string, background: string, scale: number): Background {
  return { ...DEFAULT_BACKGROUND, kind: 'pattern', color: background, pattern: { kind, color, background, scale } }
}

/** A photo slot the user swaps for their own upload. */
function photoSlot(x: number, y: number, w: number, h: number, name = 'Photo') {
  return createImage('', w, h, 1280, 720, { x, y, width: w, height: h, name })
}

const GENERAL_TEMPLATES: TemplateDef[] = [
  {
    id: 'big-text-person',
    name: 'Big Text + Person',
    category: 'Coding',
    build: (w, h) => ({
      background: gradientBg('#1e3a8a', '#060a18', 'radial'),
      objects: [
        photoSlot(w * 0.52, h * 0.06, w * 0.46, h * 0.94, 'Person'),
        createText({
          ...preset('youtube-bold'),
          text: 'LEARN\nJAVASCRIPT\nFAST',
          x: 60,
          y: 90,
          width: 620,
          height: 480,
          fontSize: 118,
          align: 'left',
        }),
        createShape({
          name: 'Accent Bar',
          shape: 'roundRect',
          x: 60,
          y: 596,
          width: 300,
          height: 56,
          cornerRadius: 12,
          fill: '#ffd400',
        }),
        createText({
          ...preset('minimal'),
          text: 'FULL COURSE',
          x: 80,
          y: 604,
          width: 260,
          height: 44,
          fontSize: 34,
          color: '#111111',
          uppercase: true,
          strokeWidth: 0,
        }),
      ],
    }),
  },
  {
    id: 'person-arrow-text',
    name: 'Person + Arrow + Text',
    category: 'Technology',
    build: (w, h) => ({
      background: patternBg('grid', '#1f3a5f', '#070b12', 52),
      objects: [
        photoSlot(w * 0.04, h * 0.1, w * 0.4, h * 0.85, 'Person'),
        createShape({
          name: 'Arrow',
          shape: 'path',
          pathData: element('arrow-right').path!,
          x: 520,
          y: 300,
          width: 200,
          height: 150,
          fill: '#ff2d2d',
        }),
        createText({
          ...preset('impact'),
          text: 'THIS CHANGES\nEVERYTHING',
          x: 700,
          y: 250,
          width: 540,
          height: 260,
          fontSize: 86,
          align: 'left',
        }),
      ],
    }),
  },
  {
    id: 'before-after',
    name: 'Before / After',
    category: 'Tutorial',
    build: (w, h) => ({
      background: gradientBg('#0f172a', '#020617', 'to-bottom'),
      objects: [
        photoSlot(40, 120, w / 2 - 70, h - 200, 'Before'),
        photoSlot(w / 2 + 30, 120, w / 2 - 70, h - 200, 'After'),
        createText({
          ...preset('minimal'),
          text: 'BEFORE',
          x: 40,
          y: 40,
          width: w / 2 - 70,
          height: 70,
          fontSize: 56,
          align: 'center',
          color: '#94a3b8',
        }),
        createText({
          ...preset('glow'),
          text: 'AFTER',
          x: w / 2 + 30,
          y: 40,
          width: w / 2 - 70,
          height: 70,
          fontSize: 56,
          align: 'center',
        }),
        createShape({
          name: 'Divider',
          shape: 'rect',
          x: w / 2 - 4,
          y: 110,
          width: 8,
          height: h - 180,
          fill: '#ffd400',
        }),
      ],
    }),
  },
  {
    id: 'question',
    name: 'Question Style',
    category: 'Education',
    build: (w, h) => ({
      background: gradientBg('#0ea5e9', '#082f49', 'to-bottom-right'),
      objects: [
        photoSlot(w * 0.58, h * 0.08, w * 0.4, h * 0.9, 'Person'),
        createShape({
          name: 'Question Mark',
          shape: 'path',
          pathData: element('question').path!,
          x: 430,
          y: 90,
          width: 150,
          height: 150,
          fill: '#ffd400',
        }),
        createText({
          ...preset('youtube-bold'),
          text: 'DO YOU KNOW\nTHIS TRICK?',
          x: 60,
          y: 270,
          width: 620,
          height: 300,
          fontSize: 96,
        }),
      ],
    }),
  },
  {
    id: 'shock',
    name: 'Shock / Reaction',
    category: 'Gaming',
    build: (w, h) => ({
      background: patternBg('rays', '#a21caf', '#12031a', 26),
      objects: [
        photoSlot(w * 0.05, h * 0.12, w * 0.42, h * 0.85, 'Reaction'),
        createShape({
          name: 'Burst',
          shape: 'star',
          x: 600,
          y: 80,
          width: 620,
          height: 400,
          fill: '#ff2d2d',
          points: 14,
          innerRatio: 0.78,
        }),
        createText({
          ...preset('comic'),
          text: 'INSANE!',
          x: 640,
          y: 210,
          width: 540,
          height: 150,
          fontSize: 110,
          align: 'center',
        }),
        createText({
          ...preset('impact'),
          text: 'NEW WORLD RECORD',
          x: 600,
          y: 520,
          width: 620,
          height: 110,
          fontSize: 58,
          align: 'center',
        }),
      ],
    }),
  },
  {
    id: 'list',
    name: 'List Style',
    category: 'Business',
    build: (w, h) => ({
      background: gradientBg('#111827', '#020617', 'to-right'),
      objects: [
        photoSlot(w * 0.6, h * 0.08, w * 0.38, h * 0.88, 'Person'),
        createText({
          ...preset('impact'),
          text: '7 HABITS',
          x: 60,
          y: 70,
          width: 640,
          height: 140,
          fontSize: 120,
        }),
        createText({
          ...preset('minimal'),
          text: '01  Wake up early\n02  Deep work\n03  Track spending',
          x: 64,
          y: 250,
          width: 620,
          height: 260,
          fontSize: 46,
          lineHeight: 1.6,
          color: '#e2e8f0',
        }),
        createShape({
          name: 'Highlight',
          shape: 'roundRect',
          x: 60,
          y: 560,
          width: 380,
          height: 62,
          cornerRadius: 10,
          fill: '#22c55e',
        }),
        createText({
          ...preset('minimal'),
          text: 'WATCH TILL THE END',
          x: 80,
          y: 572,
          width: 340,
          height: 40,
          fontSize: 30,
          color: '#052e16',
          uppercase: true,
        }),
      ],
    }),
  },
  {
    id: 'tech-review',
    name: 'Tech Review',
    category: 'Technology',
    build: (w, h) => ({
      background: gradientBg('#334155', '#0b1120', 'radial'),
      objects: [
        photoSlot(w * 0.28, h * 0.12, w * 0.44, h * 0.76, 'Product'),
        createText({
          ...preset('minimal'),
          text: 'HONEST REVIEW',
          x: 0,
          y: 48,
          width: w,
          height: 50,
          fontSize: 38,
          align: 'center',
          letterSpacing: 10,
          color: '#94a3b8',
        }),
        createText({
          ...preset('youtube-bold'),
          text: 'WORTH IT?',
          x: 0,
          y: 560,
          width: w,
          height: 130,
          fontSize: 110,
          align: 'center',
        }),
        createShape({
          name: 'Star',
          shape: 'star',
          x: 60,
          y: 260,
          width: 150,
          height: 150,
          fill: '#ffd400',
          points: 5,
          innerRatio: 0.45,
        }),
      ],
    }),
  },
  {
    id: 'tutorial',
    name: 'Tutorial',
    category: 'Tutorial',
    build: (w, h) => ({
      background: patternBg('diagonal', '#1f2937', '#0b1120', 40),
      objects: [
        photoSlot(w * 0.55, h * 0.12, w * 0.42, h * 0.8, 'Screen'),
        createShape({
          name: 'Badge',
          shape: 'roundRect',
          x: 60,
          y: 90,
          width: 260,
          height: 60,
          cornerRadius: 30,
          fill: '#ef4444',
        }),
        createText({
          ...preset('minimal'),
          text: 'STEP BY STEP',
          x: 80,
          y: 102,
          width: 220,
          height: 40,
          fontSize: 28,
          uppercase: true,
        }),
        createText({
          ...preset('youtube-bold'),
          text: 'BUILD A\nREACT APP',
          x: 60,
          y: 200,
          width: 620,
          height: 300,
          fontSize: 104,
        }),
        createText({
          ...preset('minimal'),
          text: 'in 20 minutes',
          x: 64,
          y: 530,
          width: 500,
          height: 60,
          fontSize: 44,
          color: '#facc15',
          uppercase: false,
        }),
      ],
    }),
  },
  {
    id: 'finance',
    name: 'Money Talk',
    category: 'Finance',
    build: (w, h) => ({
      background: gradientBg('#065f46', '#04120e', 'to-bottom-right'),
      objects: [
        photoSlot(w * 0.56, h * 0.1, w * 0.4, h * 0.88, 'Person'),
        createText({
          ...preset('impact'),
          text: '$10,000\nPER MONTH',
          x: 60,
          y: 150,
          width: 640,
          height: 300,
          fontSize: 108,
        }),
        createShape({
          name: 'Up Arrow',
          shape: 'path',
          pathData: element('arrow-up').path!,
          x: 62,
          y: 470,
          width: 110,
          height: 140,
          fill: '#22c55e',
        }),
        createText({
          ...preset('minimal'),
          text: 'REALISTIC PLAN',
          x: 200,
          y: 510,
          width: 420,
          height: 60,
          fontSize: 44,
          color: '#a7f3d0',
        }),
      ],
    }),
  },
  {
    id: 'news',
    name: 'Breaking News',
    category: 'News',
    build: (w, h) => ({
      background: gradientBg('#1e1b4b', '#020617', 'to-bottom'),
      objects: [
        photoSlot(0, 0, w, h, 'Background Photo'),
        createShape({ name: 'Scrim', shape: 'rect', x: 0, y: h * 0.45, width: w, height: h * 0.55, fill: '#000000', opacity: 70 }),
        createShape({ name: 'Tag', shape: 'rect', x: 60, y: 420, width: 300, height: 60, fill: '#ef4444' }),
        createText({
          ...preset('minimal'),
          text: 'BREAKING',
          x: 80,
          y: 432,
          width: 260,
          height: 40,
          fontSize: 34,
          uppercase: true,
        }),
        createText({
          ...preset('shadow'),
          text: 'THE STORY EVERYONE\nIS TALKING ABOUT',
          x: 60,
          y: 500,
          width: w - 120,
          height: 170,
          fontSize: 62,
          uppercase: true,
        }),
      ],
    }),
  },
  {
    id: 'motivation',
    name: 'Motivation',
    category: 'Motivation',
    build: (w, h) => ({
      background: gradientBg('#f97316', '#7c2d12', 'radial'),
      objects: [
        photoSlot(w * 0.3, h * 0.08, w * 0.4, h * 0.92, 'Person'),
        createText({
          ...preset('outline'),
          text: 'NO\nEXCUSES',
          x: 40,
          y: 120,
          width: 560,
          height: 340,
          fontSize: 130,
        }),
        createText({
          ...preset('impact'),
          text: 'START TODAY',
          x: 0,
          y: 590,
          width: w,
          height: 90,
          fontSize: 66,
          align: 'center',
        }),
      ],
    }),
  },
  {
    id: 'personal-brand',
    name: 'Personal Brand',
    category: 'Personal Brand',
    build: (w, h) => ({
      background: gradientBg('#7c3aed', '#10061f', 'radial'),
      objects: [
        photoSlot(w * 0.08, h * 0.14, w * 0.34, h * 0.34 * (16 / 9), 'Portrait'),
        createText({
          ...preset('minimal'),
          text: 'MY 2026 SETUP',
          x: 560,
          y: 200,
          width: 640,
          height: 60,
          fontSize: 40,
          letterSpacing: 6,
          color: '#c4b5fd',
        }),
        createText({
          ...preset('youtube-bold'),
          text: 'CREATOR\nWORKFLOW',
          x: 560,
          y: 270,
          width: 640,
          height: 260,
          fontSize: 92,
        }),
        createShape({
          name: 'Underline',
          shape: 'roundRect',
          x: 560,
          y: 540,
          width: 300,
          height: 14,
          cornerRadius: 7,
          fill: '#a78bfa',
        }),
      ],
    }),
  },
]

/** Brand layouts lead the gallery; the sub-modules only import types from here. */
/** Tagging at merge time keeps the brand files free of registry bookkeeping. */
const withBrand = (templates: TemplateDef[], brand: string): TemplateDef[] =>
  templates.map((t) => ({ ...t, brand }))

export const TEMPLATES: TemplateDef[] = [
  ...withBrand(SUPER_LEARNER_TEMPLATES, 'super-learner'),
  ...withBrand(BRAND_TEMPLATES, 'ranjan-notes'),
  ...withBrand(JUSTIN_SUNG_TEMPLATES, 'justin-sung'),
  ...withBrand(VIVIAN_TEMPLATES, 'vivian'),
  ...GENERAL_TEMPLATES,
  ...SHORTS_TEMPLATES,
]

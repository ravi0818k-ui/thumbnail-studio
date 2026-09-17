import type { ShapeFade, ShapeKind } from '../types'

export const ELEMENT_CATEGORIES = ['Arrows', 'Shapes', 'Marks', 'Highlights', 'Badges', 'Shadows'] as const

export interface ElementDef {
  id: string
  label: string
  category: (typeof ELEMENT_CATEGORIES)[number]
  shape: ShapeKind
  path?: string
  /** All paths are authored in a 100 x 100 box. */
  ratio?: number
  defaultFill?: string
  strokeOnly?: boolean
  points?: number
  innerRatio?: number
  /** Turns the fill into a fade — the scrims under the Shadows category. */
  fade?: Partial<ShapeFade>
  /** Inserted covering the whole canvas rather than at the element size. */
  fullBleed?: boolean
}

export const ELEMENTS: ElementDef[] = [
  // Arrows -------------------------------------------------------------
  { id: 'arrow-right', label: 'Arrow', category: 'Arrows', shape: 'path', path: 'M6 38 H58 V18 L96 50 L58 82 V62 H6 Z', defaultFill: '#ff2d2d' },
  { id: 'arrow-left', label: 'Arrow Left', category: 'Arrows', shape: 'path', path: 'M94 38 H42 V18 L4 50 L42 82 V62 H94 Z', defaultFill: '#ff2d2d' },
  { id: 'arrow-up', label: 'Arrow Up', category: 'Arrows', shape: 'path', path: 'M38 94 V42 H18 L50 4 L82 42 H62 V94 Z', defaultFill: '#ff2d2d' },
  { id: 'arrow-down', label: 'Arrow Down', category: 'Arrows', shape: 'path', path: 'M38 6 V58 H18 L50 96 L82 58 H62 V6 Z', defaultFill: '#ff2d2d' },
  { id: 'arrow-curved', label: 'Curved Arrow', category: 'Arrows', shape: 'path', path: 'M10 92 C10 44 42 16 78 16 L78 2 L98 26 L78 50 L78 36 C54 36 28 54 28 92 Z', defaultFill: '#ffd400' },
  { id: 'arrow-diagonal', label: 'Diagonal', category: 'Arrows', shape: 'path', path: 'M18 68 L62 24 L46 8 H92 V54 L76 38 L32 82 Z', defaultFill: '#ff2d2d' },
  { id: 'pointer', label: 'Pointer', category: 'Arrows', shape: 'path', path: 'M22 6 L80 44 L52 50 L66 84 L52 92 L38 58 L22 72 Z', defaultFill: '#ffffff' },

  // Shapes -------------------------------------------------------------
  { id: 'rect', label: 'Rectangle', category: 'Shapes', shape: 'rect', defaultFill: '#ff2d2d' },
  { id: 'round-rect', label: 'Rounded', category: 'Shapes', shape: 'roundRect', defaultFill: '#ff2d2d' },
  { id: 'circle', label: 'Circle', category: 'Shapes', shape: 'ellipse', defaultFill: '#ff2d2d' },
  { id: 'circle-outline', label: 'Circle Outline', category: 'Shapes', shape: 'ellipse', defaultFill: '#ff2d2d', strokeOnly: true },
  { id: 'triangle', label: 'Triangle', category: 'Shapes', shape: 'triangle', defaultFill: '#ffd400' },
  { id: 'line', label: 'Line', category: 'Shapes', shape: 'line', defaultFill: '#ffffff', ratio: 0.02 },
  { id: 'polygon', label: 'Hexagon', category: 'Shapes', shape: 'polygon', points: 6, defaultFill: '#3b82f6' },

  // Shadows — the scrims that make white text readable over a full-bleed photo.
  // They are ordinary rectangles with a fade, so rotating one gives the angled
  // edge, and the colour is a normal fill you can change.
  { id: 'shadow-left', label: 'Shadow left', category: 'Shadows', shape: 'rect', defaultFill: '#000000', fullBleed: true, fade: { enabled: true, from: 'left', softness: 70, midpoint: 45 } },
  { id: 'shadow-right', label: 'Shadow right', category: 'Shadows', shape: 'rect', defaultFill: '#000000', fullBleed: true, fade: { enabled: true, from: 'right', softness: 70, midpoint: 45 } },
  { id: 'shadow-bottom', label: 'Shadow bottom', category: 'Shadows', shape: 'rect', defaultFill: '#000000', fullBleed: true, fade: { enabled: true, from: 'bottom', softness: 60, midpoint: 35 } },
  { id: 'shadow-top', label: 'Shadow top', category: 'Shadows', shape: 'rect', defaultFill: '#000000', fullBleed: true, fade: { enabled: true, from: 'top', softness: 60, midpoint: 35 } },
  { id: 'shadow-vignette', label: 'Vignette', category: 'Shadows', shape: 'rect', defaultFill: '#000000', fullBleed: true, fade: { enabled: true, from: 'edges', softness: 90, midpoint: 62 } },
  { id: 'shadow-hard', label: 'Hard wedge', category: 'Shadows', shape: 'rect', defaultFill: '#000000', fullBleed: true, fade: { enabled: true, from: 'left', softness: 6, midpoint: 50 } },

  // Marks --------------------------------------------------------------
  { id: 'check', label: 'Check', category: 'Marks', shape: 'path', path: 'M6 50 L20 36 L38 54 L80 12 L94 26 L38 82 Z', defaultFill: '#22c55e' },
  { id: 'cross', label: 'Cross', category: 'Marks', shape: 'path', path: 'M22 8 L50 36 L78 8 L92 22 L64 50 L92 78 L78 92 L50 64 L22 92 L8 78 L36 50 L8 22 Z', defaultFill: '#ef4444' },
  { id: 'exclaim', label: 'Exclamation', category: 'Marks', shape: 'path', path: 'M38 4 H62 L57 58 H43 Z M50 66 a12 12 0 1 0 0.1 0 Z', defaultFill: '#ffd400' },
  { id: 'question', label: 'Question', category: 'Marks', shape: 'path', path: 'M50 4 C32 4 20 15 18 32 L37 35 C38 26 42 21 50 21 C57 21 62 25 62 32 C62 39 58 43 50 48 C42 54 40 60 40 72 H58 C58 64 60 61 67 56 C78 48 82 41 82 31 C82 15 68 4 50 4 Z M39 84 a11 11 0 1 0 0.1 0 Z', defaultFill: '#ffffff' },
  { id: 'lightning', label: 'Lightning', category: 'Marks', shape: 'path', path: 'M60 2 L18 56 H46 L38 98 L84 40 H54 Z', defaultFill: '#ffd400' },
  { id: 'play', label: 'Play', category: 'Marks', shape: 'path', path: 'M20 8 L88 50 L20 92 Z', defaultFill: '#ff0000' },
  { id: 'fire', label: 'Fire', category: 'Marks', shape: 'path', path: 'M52 2 C58 24 76 30 76 54 C76 74 64 88 50 96 C36 88 24 74 24 54 C24 42 32 34 40 28 C40 44 46 48 50 48 C55 48 58 40 52 2 Z', defaultFill: '#f97316' },
  { id: 'heart', label: 'Heart', category: 'Marks', shape: 'path', path: 'M50 92 C8 62 4 36 20 23 C33 13 46 19 50 30 C54 19 67 13 80 23 C96 36 92 62 50 92 Z', defaultFill: '#ef4444' },

  // Highlights / badges -------------------------------------------------
  { id: 'star', label: 'Star', category: 'Badges', shape: 'star', points: 5, innerRatio: 0.45, defaultFill: '#ffd400' },
  { id: 'burst', label: 'Burst', category: 'Badges', shape: 'star', points: 12, innerRatio: 0.76, defaultFill: '#ff2d2d' },
  { id: 'spark', label: 'Sparkle', category: 'Badges', shape: 'star', points: 4, innerRatio: 0.24, defaultFill: '#ffffff' },
  { id: 'highlight-bar', label: 'Highlight Bar', category: 'Highlights', shape: 'roundRect', defaultFill: '#ffd400', ratio: 0.22 },
  { id: 'underline', label: 'Underline', category: 'Highlights', shape: 'path', path: 'M2 62 C24 40 74 40 98 58 L98 78 C74 58 24 60 2 80 Z', defaultFill: '#ffd400', ratio: 0.25 },
]

export const EMOJI = [
  '😱', '🔥', '😍', '🤯', '😂', '😮', '💀', '🤔', '👀', '💰', '🚀', '⚡',
  '✅', '❌', '⭐', '💡', '🎯', '📈', '🏆', '👑', '💻', '🎮', '🎬', '🔴',
]

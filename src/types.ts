// ---------------------------------------------------------------------------
// Scene model. Everything the editor renders and exports lives in `Project`.
// The same model is drawn by engine/renderer.ts for both the on-screen canvas
// and the exported bitmap, which is what keeps export WYSIWYG.
// ---------------------------------------------------------------------------

export type ObjectType = 'image' | 'text' | 'shape'

/**
 * One editor engine, two products (spec §39): the format only changes canvas
 * size, safe zones, templates, presets and composition rules.
 */
export type CanvasFormat = 'thumbnail' | 'shorts'

/**
 * Insets, in percent of the canvas, describing where the host UI may cover the
 * design. `warning` is the width of the amber band just inside each restricted
 * edge. Editable because YouTube's chrome differs across surfaces.
 */
export interface SafeZone {
  top: number
  bottom: number
  left: number
  right: number
  warning: number
}

/** How a text layer sizes itself to its box (spec §11). */
export type AutoFit = 'off' | 'width' | 'box'

export interface Adjustments {
  brightness: number // -100..100
  contrast: number // -100..100
  saturation: number // -100..100
  exposure: number // -100..100
  highlights: number // -100..100
  shadows: number // -100..100
  temperature: number // -100..100
  tint: number // -100..100
  sharpness: number // 0..100
  blur: number // 0..100
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  exposure: 0,
  highlights: 0,
  shadows: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  blur: 0,
}

export interface ShadowEffect {
  enabled: boolean
  color: string
  blur: number
  offsetX: number
  offsetY: number
  opacity: number // 0..100
}

export interface OutlineEffect {
  enabled: boolean
  color: string
  width: number
}

export interface GlowEffect {
  enabled: boolean
  color: string
  blur: number
  intensity: number // 1..3 passes
}

export interface OverlayEffect {
  enabled: boolean
  color: string
  opacity: number // 0..100
}

export interface Effects {
  shadow: ShadowEffect
  outline: OutlineEffect
  glow: GlowEffect
  overlay: OverlayEffect
}

export const DEFAULT_EFFECTS: Effects = {
  shadow: { enabled: false, color: '#000000', blur: 24, offsetX: 8, offsetY: 12, opacity: 60 },
  outline: { enabled: false, color: '#ffffff', width: 8 },
  glow: { enabled: false, color: '#ffffff', blur: 30, intensity: 2 },
  overlay: { enabled: false, color: '#ff0044', opacity: 30 },
}

/**
 * A feather mask, modelled on Premiere Pro's mask controls: a region that
 * reveals the layer, with a soft edge (`feather`), grown or choked before
 * softening (`expand`), and optionally inverted.
 *
 * 'rect' and 'ellipse' are drawn regions inside the layer box. 'subject' is the
 * layer's own alpha — which is what softens a cut-out's silhouette or the edge
 * of a glyph, and has no meaning for an opaque rectangle.
 */
export type MaskShape = 'rect' | 'ellipse' | 'subject'

export interface FeatherMask {
  enabled: boolean
  shape: MaskShape
  /** Width of the soft edge, in canvas pixels. */
  feather: number
  /** Grows (+) or chokes (−) the mask before feathering, in canvas pixels. */
  expand: number
  /** Hide the masked area instead of revealing it. */
  invert: boolean
}

export const DEFAULT_MASK: FeatherMask = {
  enabled: false,
  shape: 'rect',
  feather: 40,
  expand: 0,
  invert: false,
}

export interface BaseObject {
  id: string
  type: ObjectType
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation: number // degrees
  opacity: number // 0..100
  locked: boolean
  hidden: boolean
  groupId: string | null
  mask: FeatherMask
}

export interface CropRect {
  // Normalised source rectangle (0..1) of the underlying asset.
  x: number
  y: number
  width: number
  height: number
}

export interface ImageObject extends BaseObject {
  type: 'image'
  assetId: string
  /** Asset produced by background removal; used instead of `assetId` when set. */
  cutoutAssetId: string | null
  useCutout: boolean
  crop: CropRect
  flipH: boolean
  flipV: boolean
  adjustments: Adjustments
  filter: string // id from data/filters.ts
  filterStrength: number // 0..100
  effects: Effects
  cornerRadius: number
  /**
   * Iconify id (`prefix:name`) when this layer came from the icon library.
   * The pixels are an ordinary black raster; the colour is the overlay effect.
   */
  icon: string | null
}

export type TextAlign = 'left' | 'center' | 'right'

export interface TextObject extends BaseObject {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic: boolean
  uppercase: boolean
  color: string
  align: TextAlign
  lineHeight: number // multiplier
  letterSpacing: number // px
  strokeColor: string
  strokeWidth: number
  effects: Effects
  /** Coloured plate drawn behind the text (classic thumbnail treatment). */
  bgEnabled: boolean
  bgColor: string
  bgPadding: number
  bgRadius: number
  /** Set when the box height should follow the wrapped text. */
  autoHeight: boolean
  /** 'width' shrinks to the box width, 'box' fills the whole box. */
  autoFit: AutoFit
  /** Keeps a line together instead of wrapping at the box width. */
  noWrap: boolean
}

export type ShapeKind =
  | 'rect'
  | 'roundRect'
  | 'ellipse'
  | 'triangle'
  | 'line'
  | 'arrow'
  | 'polygon'
  | 'star'
  | 'path'

/**
 * Which edge a shape's fill is solid at. It fades away from there — so
 * 'left' is the black scrim that lets white text sit over the left of a
 * full-bleed photo. 'edges' is a vignette, 'center' a spotlight.
 */
export type FadeFrom = 'left' | 'right' | 'top' | 'bottom' | 'edges' | 'center'

/**
 * Turns a shape's flat fill into a fade to transparent — the "black shadow"
 * every full-bleed thumbnail needs to make text readable. The angle of the
 * fade is the layer's own rotation, so a diagonal scrim is a rotated rectangle
 * rather than a second set of controls.
 */
export interface ShapeFade {
  enabled: boolean
  from: FadeFrom
  /** 0 is a hard edge; 100 spreads the transition across the whole shape. */
  softness: number
  /** Where the transition sits across the shape, in percent. */
  midpoint: number
  /**
   * Lean of the shadow's edge, read like a protractor: 90° is square to the
   * side it comes from — a straight scrim — and smaller angles tilt it towards
   * a diagonal. Ignored by the radial shapes, which have no edge to lean.
   */
  angle: number
}

export const DEFAULT_FADE: ShapeFade = { enabled: false, from: 'left', softness: 70, midpoint: 50, angle: 90 }

export interface ShapeObject extends BaseObject {
  type: 'shape'
  shape: ShapeKind
  fill: string
  fillEnabled: boolean
  stroke: string
  strokeWidth: number
  strokeEnabled: boolean
  cornerRadius: number
  points: number // polygon / star point count
  innerRatio: number // star inner radius ratio
  pathData: string | null // for shape === 'path'
  pathViewBox: [number, number]
  effects: Effects
  fade: ShapeFade
}

export type SceneObject = ImageObject | TextObject | ShapeObject

export type GradientDirection = 'to-right' | 'to-bottom-right' | 'to-bottom' | 'to-bottom-left' | 'to-left' | 'radial'

export type PatternKind = 'grid' | 'dots' | 'diagonal' | 'rays' | 'noise'

export interface Background {
  kind: 'solid' | 'gradient' | 'image' | 'pattern'
  color: string
  gradient: { from: string; to: string; direction: GradientDirection }
  assetId: string | null
  imageBlur: number
  imageDim: number // 0..100 dark overlay
  pattern: { kind: PatternKind; color: string; background: string; scale: number }
}

export const DEFAULT_BACKGROUND: Background = {
  kind: 'solid',
  color: '#101418',
  gradient: { from: '#1e3a8a', to: '#0b1020', direction: 'to-bottom-right' },
  assetId: null,
  imageBlur: 0,
  imageDim: 0,
  pattern: { kind: 'grid', color: '#2a3340', background: '#0e1218', scale: 40 },
}

export interface Project {
  id: string
  name: string
  format: CanvasFormat
  /** Brand preset this design follows; drives the Brand panel and its QA. */
  brandId: string | null
  width: number
  height: number
  safeZone: SafeZone
  background: Background
  objects: SceneObject[]
  createdAt: number
  updatedAt: number
}

/** Binary image data lives outside the undo history, keyed by id. */
export interface Asset {
  id: string
  name: string
  type: string
  blob: Blob
  width: number
  height: number
}

export interface ProjectRecord extends Project {
  thumbnail: string // data URL preview
}

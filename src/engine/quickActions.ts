import type { CropRect, ImageObject, Project, SceneObject } from '../types'
import { DEFAULT_ADJUSTMENTS } from '../types'
import { coverCrop } from './crop'

// ---------------------------------------------------------------------------
// One-click creator effects (spec §33) and subject placement (spec §14).
// These are the actions that should be easier to reach than the sliders.
// ---------------------------------------------------------------------------

export type QuickActionId =
  | 'pop'
  | 'bright'
  | 'contrast'
  | 'colors'
  | 'outline'
  | 'glow'
  | 'shadow'
  | 'reset'

export interface QuickAction {
  id: QuickActionId
  label: string
  hint: string
}

export const QUICK_ACTIONS: QuickAction[] = [
  { id: 'pop', label: 'Make pop', hint: 'Contrast, colour and a clean white outline in one go' },
  { id: 'bright', label: 'Make bright', hint: 'Lift exposure and open the shadows' },
  { id: 'contrast', label: 'More contrast', hint: 'Deepen the blacks' },
  { id: 'colors', label: 'Boost colours', hint: 'Richer, more saturated colour' },
  { id: 'outline', label: 'Add outline', hint: 'White sticker edge around the subject' },
  { id: 'glow', label: 'Add glow', hint: 'Soft halo behind the subject' },
  { id: 'shadow', label: 'Add shadow', hint: 'Grounds the subject on the background' },
  { id: 'reset', label: 'Reset looks', hint: 'Clear adjustments and effects' },
]

const clamp = (value: number, lo = -100, hi = 100) => Math.max(lo, Math.min(hi, value))

export function quickActionPatch(action: QuickActionId, obj: ImageObject): Partial<ImageObject> {
  const adjustments = { ...obj.adjustments }
  const effects = JSON.parse(JSON.stringify(obj.effects)) as ImageObject['effects']

  switch (action) {
    case 'pop':
      return {
        adjustments: {
          ...adjustments,
          contrast: clamp(adjustments.contrast + 18),
          saturation: clamp(adjustments.saturation + 15),
          sharpness: clamp(Math.max(adjustments.sharpness, 10), 0),
        },
        effects: {
          ...effects,
          outline: { enabled: true, color: '#ffffff', width: Math.max(6, effects.outline.width) },
          shadow: { ...effects.shadow, enabled: true, blur: 28, offsetX: 0, offsetY: 14, opacity: 45 },
        },
      }
    case 'bright':
      return {
        adjustments: {
          ...adjustments,
          brightness: clamp(adjustments.brightness + 12),
          exposure: clamp(adjustments.exposure + 10),
          shadows: clamp(adjustments.shadows + 12),
        },
      }
    case 'contrast':
      return { adjustments: { ...adjustments, contrast: clamp(adjustments.contrast + 20) } }
    case 'colors':
      return { adjustments: { ...adjustments, saturation: clamp(adjustments.saturation + 22) } }
    case 'outline':
      return { effects: { ...effects, outline: { enabled: true, color: '#ffffff', width: Math.max(6, effects.outline.width) } } }
    case 'glow':
      return { effects: { ...effects, glow: { enabled: true, color: effects.glow.color, blur: 44, intensity: 2 } } }
    case 'shadow':
      return {
        effects: { ...effects, shadow: { ...effects.shadow, enabled: true, blur: 32, offsetX: 0, offsetY: 18, opacity: 50 } },
      }
    case 'reset':
      return {
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        filter: 'normal',
        filterStrength: 100,
        effects: {
          shadow: { ...effects.shadow, enabled: false },
          outline: { ...effects.outline, enabled: false },
          glow: { ...effects.glow, enabled: false },
          overlay: { ...effects.overlay, enabled: false },
        },
      }
  }
}

export type Placement = 'left' | 'center' | 'right' | 'top' | 'bottom' | 'fill'

export const PLACEMENTS: { id: Placement; label: string }[] = [
  { id: 'left', label: 'Left' },
  { id: 'center', label: 'Centre' },
  { id: 'right', label: 'Right' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'fill', label: 'Fill frame' },
]

/**
 * Re-sizes and positions a cut-out subject for the canvas. Vertical canvases
 * get a taller subject anchored to the bottom, which is how Shorts covers read.
 */
export function placementPatch(placement: Placement, obj: ImageObject, project: Project): Partial<ImageObject> {
  const vertical = project.height > project.width
  const aspect = obj.width / obj.height
  const margin = Math.round(project.width * 0.04)

  if (placement === 'fill') {
    const scale = Math.max(project.width / obj.width, project.height / obj.height)
    const width = Math.round(obj.width * scale)
    const height = Math.round(obj.height * scale)
    return { x: Math.round((project.width - width) / 2), y: Math.round((project.height - height) / 2), width, height }
  }

  // Target height: a Short can carry a much larger subject than a thumbnail.
  const targetHeight = Math.round(project.height * (vertical ? 0.52 : 0.86))
  const height = targetHeight
  const width = Math.round(height * aspect)

  const bottom = Math.round(project.height - height - (vertical ? project.height * 0.14 : 0))
  switch (placement) {
    case 'left':
      return { width, height, x: margin, y: bottom }
    case 'right':
      return { width, height, x: Math.round(project.width - width - margin), y: bottom }
    case 'center':
      return { width, height, x: Math.round((project.width - width) / 2), y: bottom }
    case 'top':
      return { width, height, x: Math.round((project.width - width) / 2), y: Math.round(project.height * 0.06) }
    case 'bottom':
      return {
        width,
        height,
        x: Math.round((project.width - width) / 2),
        y: Math.round(project.height - height),
      }
  }
}

// ---------------------------------------------------------------- fit ------

export interface FitPatch {
  x: number
  y: number
  width: number
  height: number
  rotation: number
  crop?: CropRect
  fontSize?: number
}

/**
 * "Fit to canvas": the layer covers the frame exactly, edge to edge.
 *
 * A photograph fills it and the overflow is cropped, because stretching a face
 * to the canvas's aspect ratio is never what anyone means by "fit". Everything
 * else is scaled proportionally to fit *inside* and centred, for the same
 * reason. Rotation is cleared either way — a tilted layer cannot line up with
 * the frame, and leaving it would make the command look broken.
 */
export function fitToCanvasPatch(obj: SceneObject, project: Project, assetAspect?: number): FitPatch {
  if (obj.type === 'image') {
    const slot = project.width / project.height
    // Falls back to the box's own aspect when the asset has not decoded yet,
    // which at worst keeps the crop it already had.
    const aspect = assetAspect && assetAspect > 0 ? assetAspect : obj.width / Math.max(obj.height, 1)
    return { x: 0, y: 0, width: project.width, height: project.height, rotation: 0, crop: coverCrop(aspect, slot) }
  }

  const scale = Math.min(project.width / Math.max(obj.width, 1), project.height / Math.max(obj.height, 1))
  const width = Math.round(obj.width * scale)
  const height = Math.round(obj.height * scale)
  const patch: FitPatch = {
    x: Math.round((project.width - width) / 2),
    y: Math.round((project.height - height) / 2),
    width,
    height,
    rotation: 0,
  }
  // With Auto Fit on the box drives the type size; otherwise scale it the way a
  // corner drag does, or the box grows and the words stay small.
  if (obj.type === 'text' && obj.autoFit === 'off') patch.fontSize = Math.max(6, Math.round(obj.fontSize * scale))
  return patch
}

import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_EFFECTS,
  DEFAULT_FADE,
  DEFAULT_MASK,
  type ImageObject,
  type ShapeObject,
  type TextObject,
} from '../types'
import { newId } from './assets'
import { iconLabel } from './iconLibrary'
import type { ElementDef } from '../data/elements'

function cloneEffects() {
  return JSON.parse(JSON.stringify(DEFAULT_EFFECTS)) as typeof DEFAULT_EFFECTS
}

const base = (name: string) => ({
  id: newId('o'),
  name,
  rotation: 0,
  opacity: 100,
  locked: false,
  hidden: false,
  groupId: null as string | null,
  mask: { ...DEFAULT_MASK },
})

export function createText(partial: Partial<TextObject> = {}): TextObject {
  return {
    ...base(partial.text?.slice(0, 24) || 'Text'),
    type: 'text',
    x: 80,
    y: 80,
    width: 720,
    height: 160,
    text: 'YOUR TEXT',
    fontFamily: 'Anton',
    fontSize: 120,
    fontWeight: 400,
    italic: false,
    uppercase: true,
    color: '#ffffff',
    align: 'left',
    lineHeight: 1.1,
    letterSpacing: 0,
    strokeColor: '#000000',
    strokeWidth: 8,
    effects: cloneEffects(),
    bgEnabled: false,
    bgColor: '#ffd400',
    bgPadding: 16,
    bgRadius: 8,
    autoHeight: true,
    autoFit: 'off',
    noWrap: false,
    ...partial,
  }
}

export function createImage(
  assetId: string,
  assetWidth: number,
  assetHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  partial: Partial<ImageObject> = {},
): ImageObject {
  // Fit inside ~70% of the canvas so a fresh upload is immediately workable.
  const maxW = canvasWidth * 0.7
  const maxH = canvasHeight * 0.85
  const scale = Math.min(maxW / assetWidth, maxH / assetHeight, 1)
  const width = Math.round(assetWidth * scale)
  const height = Math.round(assetHeight * scale)
  return {
    ...base(partial.name ?? 'Image'),
    type: 'image',
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
    width,
    height,
    assetId,
    cutoutAssetId: null,
    useCutout: false,
    crop: { x: 0, y: 0, width: 1, height: 1 },
    flipH: false,
    flipV: false,
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    filter: 'normal',
    filterStrength: 100,
    icon: null,
    effects: cloneEffects(),
    cornerRadius: 0,
    ...partial,
  }
}

/** Share of the canvas width a freshly dropped icon takes. */
export const ICON_INSERT_SHARE = 0.18
/** Icons arrive as a black raster, so the overlay is what makes them visible. */
export const DEFAULT_ICON_COLOR = '#FFFFFF'

/**
 * An icon layer: an ordinary image whose colour is the overlay effect, so
 * recolouring is instant and outline, glow and shadow work on it unchanged.
 */
export function createIcon(
  iconId: string,
  assetId: string,
  assetWidth: number,
  assetHeight: number,
  canvasWidth: number,
  canvasHeight: number,
  color = DEFAULT_ICON_COLOR,
): ImageObject {
  const width = Math.round(canvasWidth * ICON_INSERT_SHARE)
  const height = Math.round(width * (assetHeight / Math.max(assetWidth, 1)))
  const image = createImage(assetId, assetWidth, assetHeight, canvasWidth, canvasHeight, { name: iconLabel(iconId) })
  return {
    ...image,
    icon: iconId,
    width,
    height,
    x: Math.round((canvasWidth - width) / 2),
    y: Math.round((canvasHeight - height) / 2),
    effects: { ...image.effects, overlay: { enabled: true, color, opacity: 100 } },
  }
}

export function createShape(partial: Partial<ShapeObject> = {}): ShapeObject {
  return {
    ...base(partial.name ?? 'Shape'),
    type: 'shape',
    x: 120,
    y: 120,
    width: 240,
    height: 240,
    shape: 'rect',
    fill: '#ff2d2d',
    fillEnabled: true,
    stroke: '#ffffff',
    strokeWidth: 8,
    strokeEnabled: false,
    cornerRadius: 24,
    points: 5,
    innerRatio: 0.45,
    pathData: null,
    pathViewBox: [100, 100],
    effects: cloneEffects(),
    fade: { ...DEFAULT_FADE },
    ...partial,
  }
}

export function createElement(def: ElementDef, canvasWidth: number, canvasHeight: number): ShapeObject {
  const size = Math.round(canvasWidth * 0.18)
  const height = def.ratio ? Math.round(size * def.ratio * 5) : size
  if (def.fullBleed) {
    // A scrim is only useful covering the frame it is darkening.
    return createShape({
      name: def.label,
      shape: def.shape,
      fill: def.defaultFill ?? '#000000',
      fillEnabled: true,
      strokeEnabled: false,
      cornerRadius: 0,
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      fade: { ...DEFAULT_FADE, ...def.fade },
    })
  }
  return createShape({
    name: def.label,
    shape: def.shape,
    pathData: def.path ?? null,
    pathViewBox: [100, 100],
    fill: def.defaultFill ?? '#ffffff',
    fillEnabled: !def.strokeOnly,
    strokeEnabled: !!def.strokeOnly,
    stroke: def.defaultFill ?? '#ffffff',
    strokeWidth: def.strokeOnly ? 12 : 8,
    points: def.points ?? 5,
    innerRatio: def.innerRatio ?? 0.45,
    width: size,
    height: def.ratio ? Math.max(12, height) : size,
    x: Math.round((canvasWidth - size) / 2),
    y: Math.round((canvasHeight - (def.ratio ? height : size)) / 2),
    fade: { ...DEFAULT_FADE, ...def.fade },
  })
}

export function cloneObject<T extends { id: string; x: number; y: number; name: string }>(obj: T, offset = 24): T {
  return { ...JSON.parse(JSON.stringify(obj)), id: newId('o'), x: obj.x + offset, y: obj.y + offset }
}

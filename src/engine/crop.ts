import type { CropRect, ImageObject } from '../types'
import { rotatePoint, type Rect } from './geometry'
import type { LoadedAsset } from './assets'

const EPSILON = 1e-6
const MIN_CROP = 0.02

/** Crop so an image fills a slot of a different aspect ratio without stretching. */
export function coverCrop(assetAspect: number, slotAspect: number): CropRect {
  if (assetAspect > slotAspect) {
    const width = slotAspect / assetAspect
    return { x: (1 - width) / 2, y: 0, width, height: 1 }
  }
  const height = assetAspect / slotAspect
  return { x: 0, y: (1 - height) / 2, width: 1, height }
}

/**
 * Where the *whole* asset would sit, in the object's unrotated space, given its
 * current crop. The crop box is the object box, so `full` is the frame the crop
 * slides around inside — and it stays fixed while cropping.
 */
export function fullFrameRect(obj: ImageObject): Rect {
  const scaleX = obj.width / Math.max(obj.crop.width, EPSILON)
  const scaleY = obj.height / Math.max(obj.crop.height, EPSILON)
  return {
    x: obj.x - sourceLeft(obj, obj.crop) * scaleX,
    y: obj.y - sourceTop(obj, obj.crop) * scaleY,
    width: scaleX,
    height: scaleY,
  }
}

/** A flipped layer shows the mirrored edge on the left, so the offset differs. */
function sourceLeft(obj: ImageObject, crop: CropRect): number {
  return obj.flipH ? 1 - (crop.x + crop.width) : crop.x
}

function sourceTop(obj: ImageObject, crop: CropRect): number {
  return obj.flipV ? 1 - (crop.y + crop.height) : crop.y
}

/** The crop that a box drawn inside the full frame corresponds to. */
export function cropFromBox(obj: ImageObject, box: Rect): CropRect {
  const full = fullFrameRect(obj)
  const width = clamp(box.width / full.width, MIN_CROP, 1)
  const height = clamp(box.height / full.height, MIN_CROP, 1)
  const left = clamp((box.x - full.x) / full.width, 0, 1 - width)
  const top = clamp((box.y - full.y) / full.height, 0, 1 - height)
  return {
    x: obj.flipH ? 1 - (left + width) : left,
    y: obj.flipV ? 1 - (top + height) : top,
    width,
    height,
  }
}

/** The box a crop maps to, in the object's unrotated space. */
export function boxFromCrop(obj: ImageObject, crop: CropRect): Rect {
  const full = fullFrameRect(obj)
  return {
    x: full.x + sourceLeft(obj, crop) * full.width,
    y: full.y + sourceTop(obj, crop) * full.height,
    width: crop.width * full.width,
    height: crop.height * full.height,
  }
}

/**
 * Applies a new crop and moves the box with it, so the pixels that survive the
 * crop do not move on the canvas. Rotation is handled by rotating the centre
 * delta, the same trick the resize handles use.
 */
export function applyCropRect(obj: ImageObject, next: CropRect): Partial<ImageObject> {
  const crop = normalizeCrop(next)
  const box = boxFromCrop(obj, crop)
  const oldCentre = { x: obj.x + obj.width / 2, y: obj.y + obj.height / 2 }
  const newCentreLocal = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const delta = rotatePoint(
    { x: newCentreLocal.x - oldCentre.x, y: newCentreLocal.y - oldCentre.y },
    { x: 0, y: 0 },
    obj.rotation,
  )
  return {
    crop,
    width: Math.max(1, Math.round(box.width)),
    height: Math.max(1, Math.round(box.height)),
    x: Math.round(oldCentre.x + delta.x - box.width / 2),
    y: Math.round(oldCentre.y + delta.y - box.height / 2),
  }
}

export function normalizeCrop(crop: CropRect): CropRect {
  const width = clamp(crop.width, MIN_CROP, 1)
  const height = clamp(crop.height, MIN_CROP, 1)
  return {
    x: clamp(crop.x, 0, 1 - width),
    y: clamp(crop.y, 0, 1 - height),
    width,
    height,
  }
}

/** Pans the source under a fixed box — the crop window slides, the box stays. */
export function panCrop(obj: ImageObject, dx: number, dy: number): CropRect {
  const full = fullFrameRect(obj)
  const stepX = (obj.flipH ? dx : -dx) / Math.max(full.width, EPSILON)
  const stepY = (obj.flipV ? dy : -dy) / Math.max(full.height, EPSILON)
  return normalizeCrop({ ...obj.crop, x: obj.crop.x + stepX, y: obj.crop.y + stepY })
}

export function intersectCrop(a: CropRect, b: CropRect): CropRect {
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width)
  const bottom = Math.min(a.y + a.height, b.y + b.height)
  if (right <= x || bottom <= y) return a
  return normalizeCrop({ x, y, width: right - x, height: bottom - y })
}

/**
 * Bounding box of everything that is not transparent, in normalised asset
 * coordinates. `threshold` ignores the faint fringe a feathered cut-out leaves.
 */
export function alphaBounds(asset: LoadedAsset, threshold = 12): CropRect | null {
  const canvas = document.createElement('canvas')
  canvas.width = asset.width
  canvas.height = asset.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return null
  ctx.drawImage(asset.bitmap, 0, 0)
  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  } catch {
    return null
  }
  return boundsFromAlpha(data, canvas.width, canvas.height, threshold)
}

/** Split out so the scan itself can be tested without a canvas. */
export function boundsFromAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 12,
): CropRect | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] <= threshold) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  if (maxX < 0) return null
  return {
    x: minX / width,
    y: minY / height,
    width: (maxX - minX + 1) / width,
    height: (maxY - minY + 1) / height,
  }
}

/**
 * Crop away the transparent margin a background removal leaves behind, keeping
 * the subject exactly where it is on the canvas. `padding` is a fraction of the
 * subject kept as breathing room so outlines and glows are not clipped.
 */
export function trimToSubjectPatch(
  obj: ImageObject,
  asset: LoadedAsset,
  padding = 0.01,
): Partial<ImageObject> | null {
  const bounds = alphaBounds(asset)
  if (!bounds) return null
  // Already tight: nothing worth doing.
  if (bounds.width > 0.985 && bounds.height > 0.985) return null
  const padded = normalizeCrop({
    x: bounds.x - bounds.width * padding,
    y: bounds.y - bounds.height * padding,
    width: bounds.width * (1 + padding * 2),
    height: bounds.height * (1 + padding * 2),
  })
  return applyCropRect(obj, intersectCrop(obj.crop, padded))
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value
}

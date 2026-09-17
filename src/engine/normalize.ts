import {
  DEFAULT_FADE,
  DEFAULT_MASK,
  type ImageObject,
  type Project,
  type SceneObject,
  type ShapeObject,
  type TextObject,
} from '../types'
import { defaultSafeZone, formatForSize } from '../data/formats'

/**
 * Projects saved before a field existed must keep opening. Everything added
 * after the first release gets a default here rather than a crash later.
 */
export function normalizeProject(raw: Project): Project {
  const format = raw.format ?? formatForSize(raw.width, raw.height)
  return {
    ...raw,
    format,
    // Older projects predate brand presets; null means "no brand chosen yet".
    brandId: raw.brandId ?? null,
    safeZone: { ...defaultSafeZone(format), ...(raw.safeZone ?? {}) },
    objects: (raw.objects ?? []).map(normalizeObject),
  }
}

function normalizeObject(obj: SceneObject): SceneObject {
  // Every layer type gained a feather mask at the same time.
  const withMask = { ...obj, mask: { ...DEFAULT_MASK, ...(obj.mask ?? {}) } }
  if (withMask.type === 'shape') {
    const shape = withMask as ShapeObject
    return { ...shape, fade: { ...DEFAULT_FADE, ...(shape.fade ?? {}) } }
  }
  if (withMask.type === 'image') {
    const image = withMask as ImageObject
    return { ...image, icon: image.icon ?? null }
  }
  if (withMask.type !== 'text') return withMask
  const text = withMask as TextObject
  return {
    ...text,
    autoFit: text.autoFit ?? 'off',
    noWrap: text.noWrap ?? false,
  }
}

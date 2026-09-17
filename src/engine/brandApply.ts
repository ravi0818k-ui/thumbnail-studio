import type { ImageObject, Project, ShapeObject, TextObject } from '../types'
import type { BrandElementStyle, BrandPreset, BrandTextStyle } from '../data/brands'
import { createImage, createShape, createText } from './factory'
import { measuredTextHeight } from './text'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

export function findTextStyle(preset: BrandPreset, id: string): BrandTextStyle {
  return preset.textStyles.find((s) => s.id === id) ?? preset.textStyles[0]
}

export function findElementStyle(preset: BrandPreset, id: string): BrandElementStyle {
  return preset.elementStyles.find((e) => e.id === id) ?? preset.elementStyles[0]
}

/** Everything a style sets, safe to spread onto an existing text layer. */
export function textStylePatch(preset: BrandPreset, id: string): Partial<TextObject> {
  return clone(findTextStyle(preset, id).apply)
}

/** A new text layer in this style, placed inside the safe area. */
export function brandTextObject(preset: BrandPreset, id: string, project: Project, content?: string): TextObject {
  const style = findTextStyle(preset, id)
  const margin = preset.canvas.safeMargin
  // Copy stays in the text column when the brand reserves space for a subject.
  const column = preset.rules.subject ? 1 - preset.rules.subject.share : 1
  const usable = (project.width - margin * 2) * column
  const width = Math.round(usable * (style.tier === 'L1' ? 0.96 : 0.75))
  const object = createText({
    ...textStylePatch(preset, id),
    name: style.label,
    text: content ?? defaultCopy(style),
    x: margin,
    y: Math.round(project.height * 0.34),
    width,
    height: 120,
  })
  object.height = measuredTextHeight(object)
  return object
}

function defaultCopy(style: BrandTextStyle): string {
  switch (style.tier) {
    case 'L1':
      return 'YOUR HOOK'
    case 'L2':
      return 'WHAT CHANGES'
    case 'L3':
      return 'One line that explains the promise.'
    case 'L4':
      return 'SECTION LABEL'
    default:
      return 'handwritten note'
  }
}

/** A new element in the brand style, centred on the canvas. */
export function brandElementObject(preset: BrandPreset, id: string, project: Project): ShapeObject {
  const style = findElementStyle(preset, id)
  const width = Math.round(project.width * style.size[0])
  const height = Math.round(project.height * style.size[1])
  const full = style.id === 'frame'
  return createShape({
    ...clone(style.apply),
    name: style.label,
    width: full ? project.width : Math.max(2, width),
    height: full ? project.height : Math.max(2, height),
    x: full ? 0 : Math.round((project.width - width) / 2),
    y: full ? 0 : Math.round((project.height - height) / 2),
  })
}

/** An empty slot for the brand's flat icon, sized and placed by the preset. */
export function brandIconSlot(preset: BrandPreset, project: Project): ImageObject | null {
  if (!preset.iconSlot) return null
  const size = Math.round(project.width * preset.iconSlot.share)
  // Sits on the seam between the copy and the subject.
  const seam = preset.rules.subject ? project.width * (1 - preset.rules.subject.share) : project.width / 2
  return createImage('', size, size, project.width, project.height, {
    name: preset.iconSlot.label,
    x: Math.round(seam - size * 0.75),
    y: Math.round(project.height * 0.3),
    width: size,
    height: size,
  })
}

/** The creator cut-out treatment defined by the preset. */
export function cutoutPatch(preset: BrandPreset): Partial<ImageObject> {
  return { effects: clone(preset.cutout.effects), adjustments: { ...preset.photoAdjustments } }
}

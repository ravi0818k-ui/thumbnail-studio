import { useEffect, useRef } from 'react'
import type { TemplateDef } from '../data/templates'
import { renderToCanvas } from '../engine/renderer'
import { useEditor } from '../store/editorStore'
import { defaultSafeZone, formatConfig } from '../data/formats'

/**
 * Template thumbnails come from the real renderer, so what the panel shows is
 * exactly what applying the template produces.
 */
export default function TemplatePreview({ template, width = 260 }: { template: TemplateDef; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const format = template.format ?? 'thumbnail'
  const projectWidth = useEditor((s) => s.project.width)
  const projectHeight = useEditor((s) => s.project.height)
  const projectFormat = useEditor((s) => s.project.format)
  // Preview at the size the template will actually be applied at.
  const sameFormat = projectFormat === format
  const canvasWidth = sameFormat ? projectWidth : formatConfig(format).width
  const canvasHeight = sameFormat ? projectHeight : formatConfig(format).height

  useEffect(() => {
    const host = ref.current
    if (!host) return
    let cancelled = false
    const draw = () => {
      if (cancelled) return
      const built = template.build(canvasWidth, canvasHeight)
      const scale = width / canvasWidth
      const rendered = renderToCanvas(
        {
          id: template.id,
          name: template.name,
          format,
          brandId: template.brand ?? null,
          width: canvasWidth,
          height: canvasHeight,
          safeZone: defaultSafeZone(format),
          background: built.background,
          objects: built.objects,
          createdAt: 0,
          updatedAt: 0,
        },
        scale,
      )
      host.width = rendered.width
      host.height = rendered.height
      host.getContext('2d')!.drawImage(rendered, 0, 0)
    }
    draw()
    // Re-draw once webfonts land so previews are not measured with fallbacks.
    void document.fonts?.ready.then(draw)
    return () => {
      cancelled = true
    }
  }, [template, width, canvasWidth, canvasHeight, format])

  return <canvas ref={ref} />
}

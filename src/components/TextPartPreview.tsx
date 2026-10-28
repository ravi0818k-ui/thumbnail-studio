import { useEffect, useMemo, useRef } from 'react'
import type { TextPart } from '../data/textCollection'
import { invalidateRaster, renderToCanvas } from '../engine/renderer'
import { boundingRect } from '../engine/geometry'
import { defaultSafeZone } from '../data/formats'
import { ensureFontLoaded } from '../data/fonts'
import { DEFAULT_BACKGROUND, DEFAULT_GUIDE_VISIBILITY, DEFAULT_WATCHED_BAR } from '../types'

/** The size every part is previewed at, so tiles do not change as the canvas does. */
const REF = { width: 1080, height: 1350 }
const TILE = { width: 232, height: 116 }

/**
 * A collection tile drawn by the real renderer and cropped to the part, so a
 * kicker is shown as large as a headline and what the tile shows is what
 * lands on the canvas.
 */
export default function TextPartPreview({ part }: { part: TextPart }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const objects = useMemo(() => part.build(REF.width, REF.height), [part])

  useEffect(() => {
    let cancelled = false
    const draw = () => {
      const host = ref.current
      if (cancelled || !host) return
      const box = boundingRect(objects)!
      const pad = 24
      const crop = { x: box.x - pad, y: box.y - pad, width: box.width + pad * 2, height: box.height + pad * 2 }
      // Rendered, not resized, so a small part can be drawn larger and stay sharp.
      const scale = Math.min(3, (TILE.width * 2) / crop.width, (TILE.height * 2) / crop.height)
      const rendered = renderToCanvas(
        {
          id: 'part',
          name: part.label,
          format: 'linkedin',
          brandId: null,
          ...REF,
          safeZone: defaultSafeZone('linkedin'),
          guides: { ...DEFAULT_GUIDE_VISIBILITY },
          watchedBar: { ...DEFAULT_WATCHED_BAR },
          background: { ...DEFAULT_BACKGROUND, kind: 'solid', color: '#1b2029' },
          objects,
          createdAt: 0,
          updatedAt: 0,
        },
        scale,
      )
      host.width = TILE.width * 2
      host.height = TILE.height * 2
      const ctx = host.getContext('2d')!
      ctx.fillStyle = '#1b2029'
      ctx.fillRect(0, 0, host.width, host.height)
      const w = crop.width * scale
      const h = crop.height * scale
      ctx.drawImage(rendered, crop.x * scale, crop.y * scale, w, h, (host.width - w) / 2, (host.height - h) / 2, w, h)
    }
    draw()
    // A face nothing on the page uses yet is not fetched until asked for.
    const faces = objects.flatMap((o) => (o.type === 'text' ? [ensureFontLoaded(o.fontFamily, o.fontWeight)] : []))
    // The first draw cached rasters set in the fallback face; drop them before drawing again.
    void Promise.all(faces).then(() => {
      objects.forEach((o) => invalidateRaster(o.id))
      draw()
    })
    return () => {
      cancelled = true
    }
  }, [objects, part.label])

  return <canvas ref={ref} />
}

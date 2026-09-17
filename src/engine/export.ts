import type { Project } from '../types'
import { renderToCanvas } from './renderer'

export type ExportFormat = 'png' | 'jpg' | 'webp'

export interface ExportSettings {
  format: ExportFormat
  quality: number // 1..100
  scale: number // 1 | 2 | 3
  transparent: boolean
}

export const DEFAULT_EXPORT: ExportSettings = { format: 'png', quality: 92, scale: 1, transparent: false }

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
}

export function exportCanvas(project: Project, settings: ExportSettings): HTMLCanvasElement {
  // JPEG has no alpha, so a transparent export is only honoured for PNG/WebP.
  const transparent = settings.transparent && settings.format !== 'jpg'
  return renderToCanvas(project, settings.scale, transparent)
}

export function exportBlob(project: Project, settings: ExportSettings): Promise<Blob> {
  const canvas = exportCanvas(project, settings)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Export failed'))),
      MIME[settings.format],
      settings.format === 'png' ? undefined : settings.quality / 100,
    )
  })
}

export function exportDataUrl(project: Project, settings: ExportSettings): string {
  return exportCanvas(project, settings).toDataURL(
    MIME[settings.format],
    settings.format === 'png' ? undefined : settings.quality / 100,
  )
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function safeFilename(name: string, format: ExportFormat): string {
  const base = name.trim().replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '-').toLowerCase() || 'thumbnail'
  return `${base}.${format}`
}

/** Small preview stored alongside a project in IndexedDB. */
export function projectThumbnail(project: Project, width = 320): string {
  const scale = width / project.width
  return renderToCanvas(project, scale).toDataURL('image/jpeg', 0.7)
}

import type { CanvasFormat, SafeZone } from '../types'
import type { PanelId } from '../store/editorStore'

// ---------------------------------------------------------------------------
// The whole difference between the horizontal and vertical products lives in
// this file (spec §39). Everything downstream — renderer, interaction, layers,
// history, export — is shared.
// ---------------------------------------------------------------------------

export interface SizePreset {
  label: string
  width: number
  height: number
  recommended?: boolean
}

export interface FormatConfig {
  id: CanvasFormat
  label: string
  shortLabel: string
  glyph: string
  description: string
  width: number
  height: number
  presets: SizePreset[]
  safeZone: SafeZone
  /** Left toolbar order — Shorts puts the most-used actions first (spec §38). */
  toolbar: PanelId[]
  /** Copy for the export button. */
  exportLabel: string
  /** Guidance shown on the safe-zone control. */
  safeZoneHint: string
}

export const FORMATS: Record<CanvasFormat, FormatConfig> = {
  thumbnail: {
    id: 'thumbnail',
    label: 'YouTube Thumbnail',
    shortLabel: 'Thumbnail',
    glyph: '🖼',
    description: 'Horizontal cover for a regular video.',
    width: 1280,
    height: 720,
    presets: [
      { label: '1280 × 720', width: 1280, height: 720, recommended: true },
      { label: '1920 × 1080', width: 1920, height: 1080 },
    ],
    // Duration chip, progress bar and the hover overlay live along the bottom.
    safeZone: { top: 4, bottom: 11, left: 3, right: 3, warning: 3 },
    toolbar: ['brand', 'templates', 'uploads', 'text', 'elements', 'icons', 'background', 'layers'],
    exportLabel: 'Download Thumbnail',
    safeZoneHint: 'Keeps content clear of the duration chip and progress bar.',
  },
  shorts: {
    id: 'shorts',
    label: 'YouTube Shorts',
    shortLabel: 'Shorts',
    glyph: '📱',
    description: 'Vertical 9:16 cover for a Short.',
    width: 1080,
    height: 1920,
    presets: [
      { label: '1080 × 1920', width: 1080, height: 1920, recommended: true },
      { label: '720 × 1280', width: 720, height: 1280 },
      { label: '2160 × 3840', width: 2160, height: 3840 },
    ],
    // Top search/menu row, the right-hand action rail, and the title, channel
    // and description block along the bottom.
    safeZone: { top: 9, bottom: 20, left: 4, right: 13, warning: 4 },
    toolbar: ['templates', 'uploads', 'text', 'background', 'elements', 'icons', 'brand', 'layers'],
    exportLabel: 'Download Shorts Cover',
    safeZoneHint: 'Keeps content clear of the action rail, title and channel row.',
  },
}

export const FORMAT_LIST = [FORMATS.thumbnail, FORMATS.shorts]

/** Portrait canvases are Shorts; used to classify projects saved before formats. */
export function formatForSize(width: number, height: number): CanvasFormat {
  return height > width ? 'shorts' : 'thumbnail'
}

export function formatConfig(format: CanvasFormat): FormatConfig {
  return FORMATS[format] ?? FORMATS.thumbnail
}

export function defaultSafeZone(format: CanvasFormat): SafeZone {
  return { ...formatConfig(format).safeZone }
}

export interface SafeZoneRects {
  safe: { x: number; y: number; width: number; height: number }
  warning: { x: number; y: number; width: number; height: number }
}

/** Pixel rectangles for the amber (warning) and clear (safe) regions. */
export function safeZoneRects(zone: SafeZone, width: number, height: number): SafeZoneRects {
  const warning = {
    x: (zone.left / 100) * width,
    y: (zone.top / 100) * height,
    width: width * (1 - (zone.left + zone.right) / 100),
    height: height * (1 - (zone.top + zone.bottom) / 100),
  }
  const inset = { x: (zone.warning / 100) * width, y: (zone.warning / 100) * height }
  const safe = {
    x: warning.x + inset.x,
    y: warning.y + inset.y,
    width: Math.max(0, warning.width - inset.x * 2),
    height: Math.max(0, warning.height - inset.y * 2),
  }
  return { safe, warning }
}

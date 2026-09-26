import type { Background, CanvasFormat, DeviceGuideId, Project, SafeZone } from '../types'
import type { PanelId } from '../store/editorStore'

// ---------------------------------------------------------------------------
// The whole difference between the thumbnail, Shorts and banner products lives
// in this file (spec §39). Everything downstream — renderer, interaction, layers,
// history, export — is shared.
// ---------------------------------------------------------------------------

export interface SizePreset {
  label: string
  width: number
  height: number
  recommended?: boolean
}

/**
 * One device's view of a channel banner: a band of the given size, centred on
 * the canvas. YouTube publishes these numbers; anything outside the smallest
 * band is lost on that device.
 */
export interface DeviceGuide {
  id: DeviceGuideId
  label: string
  width: number
  height: number
  /** Border and label colour; the band's tint is the same hue, faint. */
  color: string
  /** Where the label sits, chosen so no two labels overlap when all are on. */
  labelAt: 'inside-top' | 'above' | 'inside-bottom'
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
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
  /** Upload guidance printed under the export options. */
  exportNote: string
  /** What a new project's background starts as. */
  background: Background['kind']
  /** Whether the canvas size can be changed. A banner has exactly one size. */
  resizable: boolean
  /**
   * Whether the thumbnail scorer and test report apply. They measure how a
   * design survives a feed card; a banner is never shown as one.
   */
  scored: boolean
  /** Device crop guides, outermost first. Replaces the inset safe zone. */
  guides?: DeviceGuide[]
}

/** YouTube's banner spec: one 2560 × 1440 upload, cropped per device. */
const BANNER_GUIDES: DeviceGuide[] = [
  { id: 'tv', label: 'TV', width: 2560, height: 1440, color: '#e2e8f0', labelAt: 'inside-top' },
  { id: 'desktop', label: 'Desktop', width: 2560, height: 430, color: '#60a5fa', labelAt: 'above' },
  { id: 'tablet', label: 'Tablet', width: 1855, height: 423, color: '#fbbf24', labelAt: 'inside-top' },
  { id: 'mobile', label: 'Mobile', width: 1546, height: 423, color: '#4ade80', labelAt: 'inside-bottom' },
]

/**
 * The inset safe zone that matches the smallest guide, so the composition
 * checks that read `project.safeZone` treat the mobile band as the safe area
 * without a second set of numbers.
 */
function safeZoneForGuide(guide: DeviceGuide, width: number, height: number): SafeZone {
  const side = ((width - guide.width) / 2 / width) * 100
  const band = ((height - guide.height) / 2 / height) * 100
  return { top: band, bottom: band, left: side, right: side, warning: 0 }
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
    exportNote: 'YouTube accepts files up to 2 MB. 1280 × 720 PNG at 1× is the safe default.',
    background: 'solid',
    resizable: true,
    scored: true,
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
    exportNote: 'YouTube accepts files up to 2 MB. 1080 × 1920 PNG at 1× is the safe default for a Shorts cover.',
    background: 'solid',
    resizable: true,
    scored: true,
  },
  banner: {
    id: 'banner',
    label: 'YouTube Banner',
    shortLabel: 'Banner',
    glyph: '🏳',
    description: 'Channel header art, cropped per device.',
    width: 2560,
    height: 1440,
    presets: [{ label: '2560 × 1440', width: 2560, height: 1440, recommended: true }],
    safeZone: safeZoneForGuide(BANNER_GUIDES[BANNER_GUIDES.length - 1], 2560, 1440),
    // No templates yet, so the rail opens on the photo and type tools.
    toolbar: ['uploads', 'text', 'elements', 'icons', 'background', 'brand', 'layers'],
    exportLabel: 'Download Banner',
    safeZoneHint: 'Every device shows a centred band of the upload. Keep your name and logo inside Mobile.',
    exportNote:
      'YouTube accepts banners up to 6 MB, at least 2048 × 1152. Export at 1× — 2560 × 1440 is the size to upload.',
    background: 'none',
    resizable: false,
    scored: false,
    guides: BANNER_GUIDES,
  },
}

export const FORMAT_LIST = [FORMATS.thumbnail, FORMATS.shorts, FORMATS.banner]

/** Portrait canvases are Shorts; used to classify projects saved before formats (there were no banners then). */
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

/** A device guide's band, centred on the canvas. */
export function guideRect(guide: Pick<DeviceGuide, 'width' | 'height'>, width: number, height: number): Rect {
  return { x: (width - guide.width) / 2, y: (height - guide.height) / 2, width: guide.width, height: guide.height }
}

/** The smallest guide a format has — the band every device can see. */
export function innermostGuide(format: CanvasFormat): DeviceGuide | null {
  const guides = formatConfig(format).guides
  return guides && guides.length > 0 ? guides[guides.length - 1] : null
}

/** Guides switched on for this project. Older projects predate the field, so a missing entry reads as on. */
export function visibleGuides(project: Pick<Project, 'format' | 'guides'>): DeviceGuide[] {
  return (formatConfig(project.format).guides ?? []).filter((g) => project.guides?.[g.id] ?? true)
}

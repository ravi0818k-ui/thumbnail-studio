import type { CanvasFormat } from '../types'

// ---------------------------------------------------------------------------
// Where a thumbnail is actually seen. Every entry is one real YouTube surface
// with the width it gets there, because the whole point of a preview is that a
// design which works at 1280 px can be illegible at 168 px — and the sidebar,
// not the home page, is where most impressions happen.
//
// Widths are the CSS pixel widths YouTube gives the thumbnail on a typical
// 1440 px desktop window and a 390 px phone. They move a little with window
// size and experiment; they are close enough that anything failing here fails
// in the wild.
// ---------------------------------------------------------------------------

export type SurfaceLayout =
  /** Grid card: thumbnail, avatar, title, channel, view count. */
  | 'grid'
  /** Horizontal row: thumbnail left, title and channel right. */
  | 'row'
  /** Wide row with a description — search results, history, featured video. */
  | 'feature'
  /** Thumbnail alone, no metadata — playlists, Watch later grid. */
  | 'bare'
  /** Full-bleed with the app's own interface drawn over it — the Shorts player. */
  | 'immersive'
  /** Living-room scale: large thumbnail, large title beneath. */
  | 'tv'

export interface PreviewSurface {
  id: string
  group: string
  label: string
  /** Width of the thumbnail itself on that surface, in CSS pixels. */
  width: number
  layout: SurfaceLayout
  /** Shown under the label when the surface has a catch worth knowing. */
  note?: string
}

const THUMBNAIL_SURFACES: PreviewSurface[] = [
  { id: 'home-large', group: 'Desktop', label: 'Home · large grid', width: 360, layout: 'grid' },
  { id: 'home-small', group: 'Desktop', label: 'Home · dense grid', width: 246, layout: 'grid' },
  {
    id: 'search',
    group: 'Desktop',
    label: 'Search & history',
    width: 360,
    layout: 'feature',
    note: 'The one surface that shows your description, so the thumbnail carries less of the load.',
  },
  { id: 'channel-featured', group: 'Desktop', label: 'Channel · featured', width: 400, layout: 'feature' },
  { id: 'channel-grid', group: 'Desktop', label: 'Channel · videos tab', width: 210, layout: 'grid' },
  { id: 'playlist', group: 'Desktop', label: 'Playlist · Watch later', width: 246, layout: 'bare' },
  {
    id: 'sidebar',
    group: 'Desktop',
    label: 'Watch page sidebar',
    width: 168,
    layout: 'row',
    note: 'Where most of your impressions really happen. If it fails here, it fails.',
  },
  { id: 'queue', group: 'Desktop', label: 'Queue · up next', width: 100, layout: 'row', note: 'The smallest a thumbnail ever gets.' },

  { id: 'm-home', group: 'Mobile', label: 'Home feed · full width', width: 360, layout: 'grid' },
  { id: 'm-related', group: 'Mobile', label: 'Up next column', width: 168, layout: 'row' },
  { id: 'm-search', group: 'Mobile', label: 'Search results', width: 140, layout: 'row' },

  { id: 'tv-home', group: 'TV', label: 'Living room · home shelf', width: 480, layout: 'tv', note: 'Viewed from three metres away, so thin type disappears.' },
]

const SHORTS_SURFACES: PreviewSurface[] = [
  {
    id: 'shorts-feed',
    group: 'Mobile',
    label: 'Shorts player · full screen',
    width: 300,
    layout: 'immersive',
    note: 'The app draws its own controls over your cover — anything under them is lost.',
  },
  { id: 'shorts-shelf', group: 'Mobile', label: 'Shorts shelf card', width: 160, layout: 'bare' },
  { id: 'shorts-m-search', group: 'Mobile', label: 'Search results', width: 120, layout: 'row' },

  { id: 'shorts-web', group: 'Desktop', label: 'Shorts on the web', width: 250, layout: 'immersive' },
  { id: 'shorts-grid', group: 'Desktop', label: 'Channel · Shorts tab', width: 160, layout: 'grid' },
  {
    id: 'shorts-side',
    group: 'Desktop',
    label: 'Sidebar suggestion',
    width: 94,
    layout: 'row',
    note: 'A vertical cover is cropped to 16:9 in some rows — keep the subject centred.',
  },
]

export function surfacesFor(format: CanvasFormat): PreviewSurface[] {
  return format === 'shorts' ? SHORTS_SURFACES : THUMBNAIL_SURFACES
}

/** Groups in the order they should be shown, with their surfaces. */
export function groupedSurfaces(format: CanvasFormat): { group: string; surfaces: PreviewSurface[] }[] {
  const groups: { group: string; surfaces: PreviewSurface[] }[] = []
  for (const surface of surfacesFor(format)) {
    const existing = groups.find((g) => g.group === surface.group)
    if (existing) existing.surfaces.push(surface)
    else groups.push({ group: surface.group, surfaces: [surface] })
  }
  return groups
}

/** The smallest surface, which is the one a design has to survive. */
export function smallestSurface(format: CanvasFormat): PreviewSurface {
  return surfacesFor(format).reduce((min, s) => (s.width < min.width ? s : min))
}

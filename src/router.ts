import type { Screen } from './store/editorStore'

// ---------------------------------------------------------------------------
// The app has no router: screens are store state. A screen that people link
// to, or arrive at from a search, gets a real path here instead — the
// background remover, the thumbnail downloader and the tutorials. Every other
// screen lives at "/".
//
// The build writes a copy of index.html at each path (vite.config.ts) so a
// direct visit is a 200, not GitHub Pages' 404 fallback, and carries that
// page's own title and description for search and link previews.
// ---------------------------------------------------------------------------

export interface Route {
  screen: Screen
  path: string
  title: string
  description: string
}

export const ROUTES: Route[] = [
  {
    screen: 'remover',
    path: '/remove-background',
    title: 'Free Background Remover — Hair-Accurate, In Your Browser | Thumbnail Studio',
    description:
      'Remove the background from any photo for free. Hair-accurate cut-outs, a restore brush for curls, crop, and PNG or JPEG download — it all runs in your browser and nothing is uploaded.',
  },
  {
    screen: 'grabber',
    path: '/youtube-thumbnail-downloader',
    title: 'YouTube Thumbnail Downloader — Save Any Thumbnail as PNG in HD | Thumbnail Studio',
    description:
      'Paste a YouTube link and download that video’s thumbnail in full HD (1280×720) or any smaller size, as a PNG. Works with Shorts and youtu.be links, trims the black bars, and runs in your browser.',
  },
  {
    screen: 'tutorials',
    path: '/tutorials',
    title: 'YouTube Thumbnail Tutorials — Short Video Lessons | Thumbnail Studio',
    description:
      'Short video lessons for Thumbnail Studio: your first thumbnail in 7 minutes, previewing it in dark mode, light mode and on mobile, adding icons, and painting a watched bar. Every lesson opens the feature it teaches.',
  },
]

const SITE = 'https://youtubethumbnail.org'

/** index.html's own title, restored when leaving a routed screen. The selftest keeps the two equal. */
export const HOME_TITLE = 'Free YouTube Thumbnail Maker — Canva Alternative | Thumbnail Studio'

/** "/remove-background/" and "/remove-background" are the same page. */
export function normalisePath(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  return trimmed === '' ? '/' : trimmed
}

export function routeForPath(path: string): Route | null {
  const wanted = normalisePath(path)
  return ROUTES.find((r) => r.path === wanted) ?? null
}

export function routeForScreen(screen: Screen): Route | null {
  return ROUTES.find((r) => r.screen === screen) ?? null
}

/** The path a screen should show in the address bar. */
export function pathForScreen(screen: Screen): string {
  return routeForScreen(screen)?.path ?? '/'
}

export function canonicalUrl(route: Route): string {
  return `${SITE}${route.path}`
}

/** The screen to open for the address the page was loaded at. */
export function initialScreen(): Screen | null {
  if (typeof window === 'undefined') return null
  return routeForPath(window.location.pathname)?.screen ?? null
}

/**
 * index.html rewritten for one route: its title, description, canonical and
 * social tags. Used by the build to write each route's copy, so a link to the
 * remover previews as the remover rather than as the thumbnail maker.
 */
export function htmlForRoute(html: string, route: Route): string {
  const url = canonicalUrl(route)
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(route.title)}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${escape(route.description)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${escape(route.title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${escape(route.description)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${escape(route.title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${escape(route.description)}$2`)
}

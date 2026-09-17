import { registerBlob, type LoadedAsset } from './assets'

// ---------------------------------------------------------------------------
// Icons, from the Iconify API (api.iconify.design) — open source, MIT, no key,
// CORS-open.
//
// Three decisions shape everything below:
//
//   * Icons are fetched in **bulk**, as data, not as images. One request per
//     icon would mean fifty requests to open a category, and the API answers
//     that with 429 Too Many Requests — which is exactly what a grid of broken
//     tiles looks like. `{prefix}.json?icons=a,b,c` returns every body at once,
//     so a category costs one request per icon set (at most four), previews
//     need no network at all, and placing an icon needs none either.
//   * Icons are rasterised **black**, and their colour is the existing
//     colour-overlay effect. The renderer builds outline, glow and shadow from
//     a layer's silhouette, so an icon that arrives as an ordinary image layer
//     gets all three for free — and recolouring stays instant and offline.
//   * Icon bodies are third-party markup that ends up in the DOM, so they are
//     sanitised on the way in. See `sanitizeBody`.
// ---------------------------------------------------------------------------

const API = 'https://api.iconify.design'

/**
 * Only monochrome, permissively licensed sets: Material Design Icons, Tabler
 * (MIT), Phosphor (MIT) and Lucide (ISC). Multi-colour sets would lose their
 * palette the moment the overlay recoloured them.
 */
export const ICON_PREFIXES = ['mdi', 'tabler', 'ph', 'lucide']

/** Longest edge of the rasterised icon. Generous: it may be scaled up on a 4K canvas. */
export const ICON_RASTER = 1024

/** Names per bulk request. Enough for a whole category, short enough for a URL. */
export const ICON_BATCH = 64

/** Iconify's own fallback when a set declares no size. */
const DEFAULT_GRID = 16

export interface IconId {
  prefix: string
  name: string
}

export interface IconData {
  /** SVG markup, sanitised, using `currentColor`. */
  body: string
  width: number
  height: number
}

/** Iconify ids are `prefix:name`; anything else is not addressable. */
export function parseIconId(id: string): IconId | null {
  const match = /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(id.trim())
  return match ? { prefix: match[1], name: match[2] } : null
}

/** "mdi:book-open-page-variant" → "Book open page variant". */
export function iconLabel(id: string): string {
  const parsed = parseIconId(id)
  if (!parsed) return id
  const words = parsed.name.replace(/-/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function searchUrl(query: string, limit = 48): string {
  const params = new URLSearchParams({
    query,
    limit: String(Math.max(32, limit)), // the API rejects a limit below 32
    prefixes: ICON_PREFIXES.join(','),
  })
  return `${API}/search?${params}`
}

/** Every named icon of one set, in a single request. */
export function iconSetUrl(prefix: string, names: string[]): string {
  return `${API}/${prefix}.json?icons=${names.join(',')}`
}

/**
 * Icon bodies are injected into the DOM to draw the previews. Iconify's own
 * sets are clean, but this is third-party markup reaching the page, so the two
 * things that could execute — script elements and `on*` handlers — are removed
 * rather than trusted. Scripts inserted via innerHTML do not run; inline
 * handlers do.
 */
export function sanitizeBody(body: string): string {
  return body
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<\s*\/?\s*(script|foreignObject|iframe)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, '')
}

/** Standalone SVG markup for one icon, at `longEdge` pixels if given. */
export function buildSvg(icon: IconData, color = '#000000', longEdge?: number): string {
  const scale = longEdge ? longEdge / Math.max(icon.width, icon.height) : 1
  const width = Math.max(1, Math.round(icon.width * scale))
  const height = Math.max(1, Math.round(icon.height * scale))
  // The body is written against `currentColor`; substituting is what the API's
  // own `?color=` does, and it keeps the markup self-contained.
  const painted = icon.body.replace(/currentColor/g, color)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${icon.width} ${icon.height}">${painted}</svg>`
}

interface IconSetResponse {
  width?: number
  height?: number
  icons?: Record<string, { body: string; width?: number; height?: number }>
  aliases?: Record<string, { parent: string }>
}

const searches = new Map<string, string[]>()
const cache = new Map<string, IconData>()

/** Icons matching a query. Cached, because the panel re-queries on every tab. */
export async function searchIcons(query: string, limit = 48): Promise<string[]> {
  const key = `${query}|${limit}`
  const cached = searches.get(key)
  if (cached) return cached
  const response = await fetch(searchUrl(query, limit))
  if (!response.ok) throw new Error(`icon search failed (${response.status})`)
  const payload = (await response.json()) as { icons?: string[] }
  const icons = (payload.icons ?? []).filter((id) => parseIconId(id) !== null)
  searches.set(key, icons)
  return icons
}

/** Splits a list into runs of at most `size`. */
export function chunk<T>(items: T[], size = ICON_BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Groups ids by icon set, so each set is one request. */
export function groupByPrefix(ids: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>()
  for (const id of ids) {
    const parsed = parseIconId(id)
    if (!parsed) continue
    const names = groups.get(parsed.prefix) ?? []
    if (!names.includes(parsed.name)) names.push(parsed.name)
    groups.set(parsed.prefix, names)
  }
  return groups
}

/** Reads one bulk response into the cache. Exported for the tests. */
export function ingestIconSet(prefix: string, payload: IconSetResponse): void {
  const gridW = payload.width ?? DEFAULT_GRID
  const gridH = payload.height ?? payload.width ?? DEFAULT_GRID
  const icons = payload.icons ?? {}
  for (const [name, icon] of Object.entries(icons)) {
    cache.set(`${prefix}:${name}`, {
      body: sanitizeBody(icon.body),
      width: icon.width ?? gridW,
      height: icon.height ?? gridH,
    })
  }
  // A requested name can be an alias of another icon in the same response.
  // Transformations on an alias (a flip, a rotation) are not applied — an
  // alias that only renames is the common case, and a missing tile is worse
  // than one facing the same way as its parent.
  for (const [name, alias] of Object.entries(payload.aliases ?? {})) {
    const parent = cache.get(`${prefix}:${alias.parent}`)
    if (parent && !cache.has(`${prefix}:${name}`)) cache.set(`${prefix}:${name}`, parent)
  }
}

/**
 * Fetches everything not already cached, in bulk. Returns only what the API
 * knew about, so a name it does not recognise is dropped rather than drawn as
 * a broken tile.
 */
export async function loadIcons(ids: string[]): Promise<Map<string, IconData>> {
  const missing = ids.filter((id) => !cache.has(id))
  const requests: Promise<void>[] = []
  for (const [prefix, names] of groupByPrefix(missing)) {
    for (const batch of chunk(names)) {
      requests.push(
        fetch(iconSetUrl(prefix, batch))
          .then(async (response) => {
            if (!response.ok) throw new Error(`icon fetch failed (${response.status})`)
            ingestIconSet(prefix, (await response.json()) as IconSetResponse)
          }),
      )
    }
  }
  await Promise.all(requests)

  const found = new Map<string, IconData>()
  for (const id of ids) {
    const icon = cache.get(id)
    if (icon) found.set(id, icon)
  }
  return found
}

export function cachedIcon(id: string): IconData | null {
  return cache.get(id) ?? null
}

/**
 * SVG to PNG. `createImageBitmap` cannot decode SVG in every browser, so the
 * drawing goes through an `<img>` — which also means the markup needs an
 * intrinsic size, which `buildSvg` writes into it.
 */
export async function rasterizeSvg(svg: string, longEdge = ICON_RASTER): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('the icon could not be decoded'))
      image.src = url
    })
    const natural = Math.max(image.naturalWidth, image.naturalHeight) || longEdge
    const scale = longEdge / natural
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((image.naturalWidth || longEdge) * scale))
    canvas.height = Math.max(1, Math.round((image.naturalHeight || longEdge) * scale))
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob>((resolve) => canvas.toBlob((blob) => resolve(blob!), 'image/png'))
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Registers one icon as an ordinary image asset. The markup is built from the
 * data already in hand, so placing an icon costs no request at all.
 */
export async function loadIconAsset(id: string): Promise<LoadedAsset> {
  const icon = cachedIcon(id) ?? (await loadIcons([id])).get(id)
  if (!icon) throw new Error(`the icon library does not have ${id}`)
  const blob = await rasterizeSvg(buildSvg(icon, '#000000', ICON_RASTER), ICON_RASTER)
  return registerBlob(blob, iconLabel(id))
}

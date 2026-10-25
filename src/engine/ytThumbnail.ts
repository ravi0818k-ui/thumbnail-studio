// ---------------------------------------------------------------------------
// The thumbnail downloader: a YouTube link in, that video's thumbnail out.
//
// YouTube serves every video's stills at fixed addresses on i.ytimg.com, with
// `Access-Control-Allow-Origin: *`, so the browser can fetch them, draw them on
// a canvas and re-encode them as PNG — no server, no API key. A size the video
// does not have is a 404 (maxres only exists for HD uploads), which is how the
// page knows not to offer it.
//
// Everything above `fetchThumbnail` is pure and runs in the selftest.
// ---------------------------------------------------------------------------

export type ThumbSize = 'maxresdefault' | 'sddefault' | 'hqdefault' | 'mqdefault' | 'default'

export interface ThumbSizeInfo {
  id: ThumbSize
  label: string
  width: number
  height: number
}

/** Largest first: the first one a video has is the one shown. */
export const THUMB_SIZES: ThumbSizeInfo[] = [
  { id: 'maxresdefault', label: 'Max resolution', width: 1280, height: 720 },
  { id: 'sddefault', label: 'Standard', width: 640, height: 480 },
  { id: 'hqdefault', label: 'High quality', width: 480, height: 360 },
  { id: 'mqdefault', label: 'Medium', width: 320, height: 180 },
  { id: 'default', label: 'Small', width: 120, height: 90 },
]

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
  'youtu.be',
])

/** Path prefixes whose next segment is the video id: /shorts/ID, /embed/ID, /live/ID… */
const ID_PATHS = ['shorts', 'embed', 'live', 'v', 'e']

/**
 * The 11-character video id in anything a creator might paste: a watch link,
 * youtu.be, Shorts, an embed, a live link, a mobile or Music link, a link with
 * a timestamp or playlist, a link without "https://", or the bare id.
 * Anything else is null, so the page can say so rather than guess.
 */
export function parseVideoId(input: string): string | null {
  const text = input.trim()
  if (VIDEO_ID.test(text)) return text

  let url: URL
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  if (!YOUTUBE_HOSTS.has(host)) return null

  const segments = url.pathname.split('/').filter(Boolean)
  let id: string | null = null
  if (host === 'youtu.be') id = segments[0] ?? null
  else if (segments[0] === 'watch') id = url.searchParams.get('v')
  else if (ID_PATHS.includes(segments[0] ?? '')) id = segments[1] ?? null
  else if (segments[0] === 'attribution_link') {
    // /attribution_link?u=/watch?v=ID — the shared-from-app form.
    const inner = url.searchParams.get('u')
    if (inner) return parseVideoId(`https://www.youtube.com${inner.startsWith('/') ? '' : '/'}${inner}`)
  }
  return id && VIDEO_ID.test(id) ? id : null
}

export function thumbnailUrl(id: string, size: ThumbSize): string {
  return `https://i.ytimg.com/vi/${id}/${size}.jpg`
}

export function watchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`
}

/** A file name from the video's title, falling back to its id. */
export function downloadName(title: string | null, id: string, size: ThumbSize, ext: 'png' | 'jpg'): string {
  const slug = (title ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '')
  return `${slug || id}-thumbnail-${size}.${ext}`
}

/**
 * Black bars above and below the picture. The 4:3 sizes (sd, hq, default) of a
 * 16:9 video are letterboxed, and a creator wants the picture, not the bars.
 * A row counts as bar when it is near-black and flat; the bars are trimmed only
 * when both are present and roughly equal, because a single dark band is far
 * more likely to be a dark sky or a black shirt than letterboxing.
 */
export function letterbox(data: Uint8ClampedArray, width: number, height: number): { top: number; bottom: number } {
  const isBar = (y: number) => {
    let sum = 0
    let max = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const v = Math.max(data[i], data[i + 1], data[i + 2])
      sum += v
      if (v > max) max = v
    }
    return sum / width < BAR_MEAN && max < BAR_MAX
  }
  let top = 0
  while (top < height / 3 && isBar(top)) top++
  let bottom = 0
  while (bottom < height / 3 && isBar(height - 1 - bottom)) bottom++
  const min = Math.max(2, Math.round(height * 0.03))
  if (top < min || bottom < min || Math.abs(top - bottom) > Math.max(3, height * 0.02)) return { top: 0, bottom: 0 }
  // A frame that is mostly "bar" is a black still (a fade, a title card), not letterboxing.
  if (top + bottom > height * 0.4) return { top: 0, bottom: 0 }
  // JPEG smears the edge row, so the found picture is often a pixel off 16:9
  // (480 × 271). Within a few rows of it, snap to the exact ratio, centred.
  const wide = Math.round((width * 9) / 16)
  if (Math.abs(height - top - bottom - wide) <= 3) {
    const cut = height - wide
    top = Math.floor(cut / 2)
    bottom = cut - top
  }
  return { top, bottom }
}

/** Bars are compressed JPEG black, never quite 0. */
const BAR_MEAN = 14
const BAR_MAX = 40

// ---------------------------------------------------------------- browser side

export interface VideoInfo {
  title: string | null
  author: string | null
}

/**
 * Title and channel from YouTube's oEmbed endpoint, which allows cross-origin
 * reads. It is a nicety — a name for the file — so any failure is just null.
 */
export async function fetchVideoInfo(id: string, signal?: AbortSignal): Promise<VideoInfo | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl(id))}`, { signal })
    if (!res.ok) return null
    const json = (await res.json()) as { title?: unknown; author_name?: unknown }
    return {
      title: typeof json.title === 'string' ? json.title : null,
      author: typeof json.author_name === 'string' ? json.author_name : null,
    }
  } catch {
    return null
  }
}

/** The JPEG YouTube serves at one size, or null when the video has no still at that size. */
export async function fetchThumbnail(id: string, size: ThumbSize, signal?: AbortSignal): Promise<Blob | null> {
  try {
    const res = await fetch(thumbnailUrl(id, size), { signal })
    if (!res.ok) return null
    return await res.blob()
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    return null
  }
}

export interface Decoded {
  bitmap: ImageBitmap
  width: number
  height: number
  bars: { top: number; bottom: number }
}

export async function decodeThumbnail(blob: Blob): Promise<Decoded> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  const bars = letterbox(ctx.getImageData(0, 0, bitmap.width, bitmap.height).data, bitmap.width, bitmap.height)
  return { bitmap, width: bitmap.width, height: bitmap.height, bars }
}

/** The still re-encoded as PNG, with the letterbox bars cut off when `trim` is set. */
export function toPng(image: Decoded, trim: boolean): Promise<Blob> {
  const top = trim ? image.bars.top : 0
  const height = image.height - top - (trim ? image.bars.bottom : 0)
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = height
  canvas.getContext('2d')!.drawImage(image.bitmap, 0, top, image.width, height, 0, 0, image.width, height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png'),
  )
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

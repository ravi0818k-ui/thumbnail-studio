/**
 * The green-screen backdrop: a device screen turned into one flat colour, so a
 * phone, tablet or spare monitor propped behind a subject can stand in for a
 * chroma-key sheet while recording B-roll.
 *
 * `GreenScreen` renders this data and holds no colours of its own. It never
 * touches the camera or microphone — it paints a colour and nothing else — and
 * the selftest fails if either API appears in the component.
 */

export interface BackdropPreset {
  id: string
  label: string
  hex: string
  /** What it is for, in one line under the swatch. */
  use: string
}

/**
 * Green and blue are the two broadcast keying colours. The references are there
 * because the same propped-up screen is a handy white-balance card or a black
 * flag, and a neutral grey is what an exposure meter expects.
 */
export const BACKDROP_PRESETS: BackdropPreset[] = [
  { id: 'green', label: 'Chroma green', hex: '#00B140', use: 'The default key. Furthest from skin tones.' },
  { id: 'blue', label: 'Chroma blue', hex: '#0047AB', use: 'For green clothing, plants or blonde hair.' },
  { id: 'white', label: 'White', hex: '#FFFFFF', use: 'A white-balance reference or a soft fill light.' },
  { id: 'grey', label: 'Neutral grey', hex: '#777777', use: 'An exposure reference (about 18% grey).' },
  { id: 'black', label: 'Black', hex: '#000000', use: 'A negative fill, or a clean black surround.' },
]

export const DEFAULT_BACKDROP = BACKDROP_PRESETS[0]

export interface BackdropResolution {
  id: string
  label: string
  width: number
  height: number
}

/**
 * The output sizes offered for a downloaded backdrop image, for a TV or tablet
 * that will show a picture but cannot open this page. Full screen in the browser
 * always fills the display at its native size whatever is picked here — a CSS
 * fill has no resolution to get wrong.
 */
export const BACKDROP_RESOLUTIONS: BackdropResolution[] = [
  { id: '720p', label: '720p', width: 1280, height: 720 },
  { id: '1080p', label: '1080p', width: 1920, height: 1080 },
  { id: '1440p', label: '1440p', width: 2560, height: 1440 },
  { id: '4k', label: '4K', width: 3840, height: 2160 },
]

/** Seconds of stillness before the exit control fades away again in full screen. */
export const EXIT_CONTROL_SECONDS = 3

/** `#abc` or `#aabbcc`, either case, to `#AABBCC`; anything else is null. */
export function normalizeHex(value: string): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!m) return null
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1]
  return `#${h.toUpperCase()}`
}

/**
 * The physical pixel size of the screen this page is on, landscape-first, so it
 * can be compared with the named resolutions. Rounded because a fractional
 * device-pixel ratio (1.25 on many laptops) gives fractional products.
 */
export function detectedResolution(
  screenWidth: number,
  screenHeight: number,
  devicePixelRatio: number,
): { width: number; height: number } {
  const ratio = devicePixelRatio > 0 ? devicePixelRatio : 1
  const a = Math.round(screenWidth * ratio)
  const b = Math.round(screenHeight * ratio)
  return { width: Math.max(a, b), height: Math.min(a, b) }
}

/**
 * The named resolution closest to a detected one by pixel count, so the picker
 * starts on the size that suits this screen rather than on an arbitrary default.
 */
export function nearestResolution(width: number, height: number): BackdropResolution {
  const pixels = width * height
  let best = BACKDROP_RESOLUTIONS[0]
  for (const r of BACKDROP_RESOLUTIONS) {
    if (Math.abs(r.width * r.height - pixels) < Math.abs(best.width * best.height - pixels)) best = r
  }
  return best
}

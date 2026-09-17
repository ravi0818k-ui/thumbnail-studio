export interface FilterDef {
  id: string
  label: string
  /** CSS filter fragments applied at 100% strength. */
  css: string
}

export const FILTERS: FilterDef[] = [
  { id: 'normal', label: 'Normal', css: '' },
  { id: 'vibrant', label: 'Vibrant', css: 'saturate(1.6) contrast(1.12)' },
  { id: 'cinematic', label: 'Cinematic', css: 'contrast(1.25) saturate(0.85) sepia(0.12) brightness(0.95)' },
  { id: 'warm', label: 'Warm', css: 'sepia(0.35) saturate(1.3) brightness(1.05) hue-rotate(-10deg)' },
  { id: 'cool', label: 'Cool', css: 'hue-rotate(190deg) saturate(1.15) brightness(1.02)' },
  { id: 'contrast', label: 'High Contrast', css: 'contrast(1.55) saturate(1.1)' },
  { id: 'bw', label: 'Black & White', css: 'grayscale(1) contrast(1.15)' },
  { id: 'dark', label: 'Dark', css: 'brightness(0.72) contrast(1.2) saturate(0.9)' },
  { id: 'bright', label: 'Bright', css: 'brightness(1.22) saturate(1.1) contrast(0.95)' },
  { id: 'retro', label: 'Retro', css: 'sepia(0.5) saturate(1.4) contrast(0.9) hue-rotate(-20deg)' },
]

export const FILTER_BY_ID = new Map(FILTERS.map((f) => [f.id, f]))

/**
 * Scales a filter string toward identity so the strength slider works for
 * every preset without hand-written interpolation per filter.
 */
export function scaleFilter(css: string, strength: number): string {
  if (!css) return ''
  const t = Math.max(0, Math.min(1, strength / 100))
  if (t === 1) return css
  return css.replace(/([a-z-]+)\(([-\d.]+)(deg)?\)/g, (_m, fn: string, raw: string, deg?: string) => {
    const value = parseFloat(raw)
    const identity = deg ? 0 : fn === 'brightness' || fn === 'contrast' || fn === 'saturate' ? 1 : 0
    const mixed = identity + (value - identity) * t
    return `${fn}(${round(mixed)}${deg ?? ''})`
  })
}

function round(n: number): string {
  return String(Math.round(n * 1000) / 1000)
}

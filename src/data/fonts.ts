export interface FontDef {
  family: string
  label: string
  category: 'Bold' | 'Modern' | 'Condensed' | 'Tech' | 'Handwritten' | 'Display'
  weights: number[]
}

/** A curated set rather than thousands of faces — see spec §20. */
export const FONTS: FontDef[] = [
  { family: 'Anton', label: 'Anton', category: 'Bold', weights: [400] },
  { family: 'Archivo Black', label: 'Archivo Black', category: 'Bold', weights: [400] },
  { family: 'Montserrat', label: 'Montserrat', category: 'Bold', weights: [700, 900] },
  { family: 'Poppins', label: 'Poppins', category: 'Modern', weights: [700, 900] },
  { family: 'Inter', label: 'Inter', category: 'Modern', weights: [400, 600, 700, 900] },
  { family: 'League Spartan', label: 'League Spartan', category: 'Bold', weights: [700, 800, 900] },
  { family: 'Bebas Neue', label: 'Bebas Neue', category: 'Condensed', weights: [400] },
  { family: 'Oswald', label: 'Oswald', category: 'Condensed', weights: [500, 700] },
  { family: 'Teko', label: 'Teko', category: 'Condensed', weights: [600, 700] },
  { family: 'JetBrains Mono', label: 'JetBrains Mono', category: 'Tech', weights: [700] },
  { family: 'Rubik Mono One', label: 'Rubik Mono', category: 'Tech', weights: [400] },
  { family: 'Luckiest Guy', label: 'Luckiest Guy', category: 'Display', weights: [400] },
  { family: 'Permanent Marker', label: 'Permanent Marker', category: 'Handwritten', weights: [400] },
  { family: 'Caveat', label: 'Caveat', category: 'Handwritten', weights: [700] },
  { family: 'Patrick Hand', label: 'Patrick Hand', category: 'Handwritten', weights: [400] },
  { family: 'Impact', label: 'Impact (system)', category: 'Display', weights: [400] },
]

export const FONT_CATEGORIES = ['Bold', 'Modern', 'Condensed', 'Tech', 'Handwritten', 'Display'] as const

export function fontStack(family: string): string {
  return `"${family}", "Arial Black", Impact, system-ui, sans-serif`
}

/** Blocks the first paint of a new text object until its face is ready. */
export async function ensureFontLoaded(family: string, weight: number, size = 100): Promise<void> {
  if (!('fonts' in document)) return
  try {
    await document.fonts.load(`${weight} ${size}px "${family}"`)
  } catch {
    /* system font, nothing to fetch */
  }
}

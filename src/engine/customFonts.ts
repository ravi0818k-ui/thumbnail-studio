import { useSyncExternalStore } from 'react'
import { FONTS } from '../data/fonts'
import { invalidateRaster } from './renderer'
import {
  ACCEPTED_EXTENSIONS,
  FONT_EXTENSIONS,
  FontFileError,
  MAX_FACES,
  MAX_FONT_BYTES,
  MAX_ZIP_BYTES,
  extensionOf,
  fontsInZip,
  guessFromFileName,
  isZip,
  readFontInfo,
  sniffFont,
  type FontInfo,
} from './fontFile'

/**
 * Fonts someone uploaded, for the life of the tab. They are registered with
 * `document.fonts`, so the canvas, the export and the font menus all draw them
 * exactly like a Google face. Nothing is stored: a design reopened later falls
 * back to the default stack until the font is uploaded again.
 */

export interface CustomFace {
  fileName: string
  weight: number | [number, number]
  italic: boolean
  face: FontFace
}

export interface CustomFamily {
  family: string
  /** The weights the menu offers: each static face, or every hundred a variable face spans. */
  weights: number[]
  faces: CustomFace[]
}

export interface UploadResult {
  /** Families that gained at least one face. */
  added: string[]
  /** One line per file that was refused, naming the file and the reason. */
  problems: string[]
}

let families: CustomFamily[] = []
const listeners = new Set<() => void>()

function publish(next: CustomFamily[]) {
  families = next
  // A text layer may already name this family and have been rasterised in the fallback face.
  invalidateRaster()
  listeners.forEach((fn) => fn())
}

export function onCustomFontsChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function customFamilies(): CustomFamily[] {
  return families
}

export function useCustomFonts(): CustomFamily[] {
  return useSyncExternalStore(onCustomFontsChanged, customFamilies)
}

/** The weights a family offers, uploaded or built in; null for a family nobody has loaded. */
export function familyWeights(family: string): number[] | null {
  return (
    families.find((f) => f.family === family)?.weights ?? FONTS.find((f) => f.family === family)?.weights ?? null
  )
}

export function nearestOf(weights: number[], wanted: number): number {
  if (weights.length === 0) return wanted
  return weights.reduce((best, w) => (Math.abs(w - wanted) < Math.abs(best - wanted) ? w : best), weights[0])
}

function weightsOf(faces: CustomFace[]): number[] {
  const set = new Set<number>()
  for (const { weight } of faces) {
    if (typeof weight === 'number') set.add(weight)
    else for (let w = Math.ceil(weight[0] / 100) * 100; w <= weight[1]; w += 100) set.add(w)
  }
  return [...set].sort((a, b) => a - b)
}

interface Candidate {
  fileName: string
  bytes: Uint8Array
  info: FontInfo
}

function baseName(path: string): string {
  return path.replace(/^.*[\\/]/, '')
}

/** Validates every file, loads what passes, and reports the rest by name. */
export async function uploadFonts(files: File[]): Promise<UploadResult> {
  const problems: string[] = []
  const candidates: Candidate[] = []

  const consider = async (fileName: string, bytes: Uint8Array) => {
    const kind = sniffFont(bytes)
    if (!kind) return problems.push(`${fileName}: its contents are not a font, whatever the file name says.`)
    if (kind === 'ttc') return problems.push(`${fileName}: font collections (.ttc) hold several fonts — upload the single .ttf files instead.`)
    try {
      candidates.push({ fileName, bytes, info: await readFontInfo(bytes) })
    } catch (err) {
      const why = err instanceof FontFileError ? err.message : 'it could not be read'
      problems.push(`${fileName}: ${why}.`)
    }
  }

  for (const file of files) {
    const ext = extensionOf(file.name)
    if (!(ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) {
      problems.push(`${file.name}: not a font file. Use .ttf, .otf, .woff, .woff2, or the .zip Google Fonts downloads.`)
      continue
    }
    const limit = ext === 'zip' ? MAX_ZIP_BYTES : MAX_FONT_BYTES
    if (file.size > limit) {
      problems.push(`${file.name}: larger than ${limit / 1024 / 1024} MB, which no single font family needs.`)
      continue
    }
    if (file.size === 0) {
      problems.push(`${file.name}: the file is empty.`)
      continue
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (ext !== 'zip') {
      await consider(file.name, bytes)
      continue
    }
    if (!isZip(bytes)) {
      problems.push(`${file.name}: named .zip but it is not a zip archive.`)
      continue
    }
    try {
      const entries = await fontsInZip(bytes)
      if (entries.length === 0) {
        problems.push(`${file.name}: no ${FONT_EXTENSIONS.map((e) => '.' + e).join(', ')} files inside.`)
        continue
      }
      for (const entry of entries) await consider(`${file.name} › ${baseName(entry.name)}`, entry.bytes)
    } catch (err) {
      problems.push(`${file.name}: ${err instanceof FontFileError ? err.message : 'could not be opened'}.`)
    }
  }

  // A Google Fonts zip ships the variable font and a static/ folder of the same
  // faces. Keeping both would list every weight twice, so the static set wins.
  const staticFamilies = new Set(candidates.filter((c) => !c.info.variable).map((c) => c.info.family))
  const chosen = candidates.filter((c) => !c.info.variable || !staticFamilies.has(c.info.family))
  if (chosen.length > MAX_FACES) {
    problems.push(`Only the first ${MAX_FACES} fonts were loaded; ${chosen.length - MAX_FACES} more were skipped.`)
    chosen.length = MAX_FACES
  }

  let next = families
  const added = new Set<string>()
  for (const c of chosen) {
    const guess = guessFromFileName(baseName(c.fileName))
    const family = c.info.family ?? guess.family
    const weight = c.info.weight ?? guess.weight
    const italic = c.info.family ? c.info.italic : guess.italic
    if (!family) {
      problems.push(`${c.fileName}: the font has no readable family name.`)
      continue
    }
    if (FONTS.some((f) => f.family.toLowerCase() === family.toLowerCase())) {
      problems.push(`${c.fileName}: ${family} is already in the font list — pick it there.`)
      continue
    }

    const descriptor = typeof weight === 'number' ? String(weight) : `${weight[0]} ${weight[1]}`
    const face = new FontFace(family, c.bytes.slice().buffer, { weight: descriptor, style: italic ? 'italic' : 'normal' })
    try {
      // The browser sanitises the face here; a corrupt or hostile file is refused.
      await face.load()
    } catch {
      problems.push(`${c.fileName}: the browser could not read this font — it is damaged or not a valid font.`)
      continue
    }

    const existing = next.find((f) => f.family === family)
    const kept = (existing?.faces ?? []).filter((f) => {
      const same = f.italic === italic && JSON.stringify(f.weight) === JSON.stringify(weight)
      if (same) document.fonts.delete(f.face)
      return !same
    })
    document.fonts.add(face)
    const faces = [...kept, { fileName: baseName(c.fileName), weight, italic, face }]
    const entry: CustomFamily = { family, weights: weightsOf(faces), faces }
    next = existing ? next.map((f) => (f === existing ? entry : f)) : [...next, entry]
    added.add(family)
  }

  if (added.size > 0) publish(next)
  return { added: [...added], problems }
}

export function removeCustomFamily(family: string): void {
  const entry = families.find((f) => f.family === family)
  if (!entry) return
  entry.faces.forEach((f) => document.fonts.delete(f.face))
  publish(families.filter((f) => f !== entry))
}

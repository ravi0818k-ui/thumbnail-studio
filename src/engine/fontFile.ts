/**
 * Reading font files someone uploads. Pure byte work, no DOM, so the selftest
 * can run all of it in Node; `customFonts.ts` does the registering.
 *
 * The file's own bytes decide what it is, never its name: a renamed JPEG
 * passes an extension check and still is not a font. The browser's FontFace
 * loader (which runs every face through a sanitiser) is the final gate.
 */

export const FONT_EXTENSIONS = ['ttf', 'otf', 'woff', 'woff2'] as const
export const ACCEPTED_EXTENSIONS = [...FONT_EXTENSIONS, 'zip'] as const
/** For the file input's `accept`. */
export const FONT_ACCEPT = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',')

/** Google's biggest static faces (CJK) are ~10 MB; nothing sensible is larger. */
export const MAX_FONT_BYTES = 15 * 1024 * 1024
/** A Google Fonts family zip with every static weight is well under this. */
export const MAX_ZIP_BYTES = 60 * 1024 * 1024
/** Faces per upload, so a zip of a whole font library cannot flood the list. */
export const MAX_FACES = 40

export type FontKind = 'ttf' | 'otf' | 'woff' | 'woff2' | 'ttc'

export interface FontInfo {
  kind: FontKind
  /** Typographic family (name ID 16, else 1), already made CSS-safe. Null if unreadable. */
  family: string | null
  /** usWeightClass, or a range for a variable font with a `wght` axis. */
  weight: number | [number, number] | null
  italic: boolean
  variable: boolean
}

export class FontFileError extends Error {}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Identifies a font from its first four bytes. */
export function sniffFont(bytes: Uint8Array): FontKind | null {
  if (bytes.length < 12) return null
  const tag = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  if (bytes[0] === 0 && bytes[1] === 1 && bytes[2] === 0 && bytes[3] === 0) return 'ttf'
  if (tag === 'true') return 'ttf'
  if (tag === 'OTTO') return 'otf'
  if (tag === 'wOFF') return 'woff'
  if (tag === 'wOF2') return 'woff2'
  if (tag === 'ttcf') return 'ttc'
  return null
}

export function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * A family name goes inside `ctx.font` and CSS as `"name"`, so a quote,
 * backslash or semicolon would break every font string it reaches.
 */
export function safeFamilyName(raw: string): string {
  return raw
    .replace(/[^\p{L}\p{N} _\-.&']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64)
}

const WEIGHT_WORDS: [RegExp, number][] = [
  [/thin|hairline/i, 100],
  [/extra-?light|ultra-?light/i, 200],
  [/light/i, 300],
  [/medium/i, 500],
  [/semi-?bold|demi-?bold/i, 600],
  [/extra-?bold|ultra-?bold/i, 800],
  [/black|heavy/i, 900],
  [/bold/i, 700],
]

/** "Roboto-SemiBoldItalic.woff2" → Roboto, 600, italic. For when the bytes cannot be read (WOFF2). */
export function guessFromFileName(fileName: string): { family: string; weight: number; italic: boolean } {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '')
  const [head, ...rest] = base.split(/[-_]/)
  const style = rest.join(' ')
  const weight = WEIGHT_WORDS.find(([re]) => re.test(style))?.[1] ?? 400
  // "OpenSans" → "Open Sans", the way Google names the family.
  const family = safeFamilyName(head.replace(/([a-z])([A-Z])/g, '$1 $2'))
  return { family, weight, italic: /italic|oblique/i.test(style) }
}

// ------------------------------------------------------------ sfnt tables ---

type TableReader = (tag: string) => Promise<DataView | null>

function view(bytes: Uint8Array, offset = 0, length = bytes.length - offset): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, length)
}

function tag4(v: DataView, at: number): string {
  return String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3))
}

function sfntTables(bytes: Uint8Array): TableReader {
  const v = view(bytes)
  const count = v.getUint16(4)
  const dir = new Map<string, [number, number]>()
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16
    if (at + 16 > bytes.length) throw new FontFileError('table directory runs past the end of the file')
    dir.set(tag4(v, at), [v.getUint32(at + 8), v.getUint32(at + 12)])
  }
  return async (tag) => {
    const entry = dir.get(tag)
    if (!entry) return null
    const [offset, length] = entry
    if (offset + length > bytes.length) throw new FontFileError(`the ${tag} table runs past the end of the file`)
    return view(bytes, offset, length)
  }
}

async function inflate(data: Uint8Array, format: 'deflate' | 'deflate-raw', expected: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream(format))
  const out = new Uint8Array(await new Response(stream).arrayBuffer())
  if (out.length !== expected) throw new FontFileError('a compressed part has the wrong size')
  return out
}

function woffTables(bytes: Uint8Array): TableReader {
  const v = view(bytes)
  const count = v.getUint16(12)
  const dir = new Map<string, [number, number, number]>()
  for (let i = 0; i < count; i++) {
    const at = 44 + i * 20
    if (at + 20 > bytes.length) throw new FontFileError('table directory runs past the end of the file')
    dir.set(tag4(v, at), [v.getUint32(at + 4), v.getUint32(at + 8), v.getUint32(at + 12)])
  }
  return async (tag) => {
    const entry = dir.get(tag)
    if (!entry) return null
    const [offset, compLength, origLength] = entry
    if (offset + compLength > bytes.length) throw new FontFileError(`the ${tag} table runs past the end of the file`)
    const raw = bytes.subarray(offset, offset + compLength)
    const data = compLength < origLength ? await inflate(raw, 'deflate', origLength) : raw
    return view(data)
  }
}

function decodeName(v: DataView, at: number, length: number, platform: number): string {
  let s = ''
  if (platform === 1) {
    for (let i = 0; i < length; i++) s += String.fromCharCode(v.getUint8(at + i))
  } else {
    for (let i = 0; i + 1 < length; i += 2) s += String.fromCharCode(v.getUint16(at + i))
  }
  return s
}

/** Typographic family (16), else family (1); Windows English first, then anything readable. */
function familyFromName(v: DataView): string | null {
  const count = v.getUint16(2)
  const strings = v.getUint16(4)
  const found: { id: number; rank: number; text: string }[] = []
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12
    if (at + 12 > v.byteLength) break
    const platform = v.getUint16(at)
    const language = v.getUint16(at + 4)
    const id = v.getUint16(at + 6)
    const length = v.getUint16(at + 8)
    const offset = strings + v.getUint16(at + 10)
    if ((id !== 1 && id !== 16) || offset + length > v.byteLength) continue
    if (platform !== 0 && platform !== 1 && platform !== 3) continue
    const rank = platform === 3 && language === 0x409 ? 0 : platform === 3 ? 1 : 2
    found.push({ id, rank, text: decodeName(v, offset, length, platform) })
  }
  found.sort((a, b) => b.id - a.id || a.rank - b.rank)
  for (const f of found) {
    const name = safeFamilyName(f.text)
    if (name) return name
  }
  return null
}

/** Reads family, weight, style and variability from an uploaded face. */
export async function readFontInfo(bytes: Uint8Array): Promise<FontInfo> {
  const kind = sniffFont(bytes)
  if (!kind) throw new FontFileError('its contents are not a font')
  const empty: FontInfo = { kind, family: null, weight: null, italic: false, variable: false }
  // A collection holds several faces and FontFace takes one; WOFF2 tables are
  // Brotli-compressed and transformed, so the browser loader reads those alone.
  if (kind === 'ttc' || kind === 'woff2') return empty

  const table = kind === 'woff' ? woffTables(bytes) : sfntTables(bytes)
  const [name, os2, head, fvar] = await Promise.all([table('name'), table('OS/2'), table('head'), table('fvar')])
  if (!name) throw new FontFileError('it has no name table, so it is damaged or not a text font')

  const info: FontInfo = { ...empty, family: familyFromName(name) }
  if (os2 && os2.byteLength >= 64) {
    info.weight = os2.getUint16(4)
    info.italic = (os2.getUint16(62) & 0x201) !== 0
  } else if (head && head.byteLength >= 46) {
    info.italic = (head.getUint16(44) & 2) !== 0
  }
  if (fvar && fvar.byteLength >= 16) {
    info.variable = true
    const axesAt = fvar.getUint16(4)
    const axisCount = fvar.getUint16(8)
    const axisSize = fvar.getUint16(10)
    for (let i = 0; i < axisCount; i++) {
      const at = axesAt + i * axisSize
      if (at + 20 > fvar.byteLength) break
      if (tag4(fvar, at) !== 'wght') continue
      const min = Math.round(fvar.getInt32(at + 4) / 65536)
      const max = Math.round(fvar.getInt32(at + 12) / 65536)
      if (min >= 1 && max <= 1000 && min < max) info.weight = [min, max]
    }
  }
  if (typeof info.weight === 'number' && (info.weight < 1 || info.weight > 1000)) info.weight = null
  return info
}

// ------------------------------------------------------------------- zip ---

export interface ZipEntry {
  name: string
  bytes: Uint8Array
}

/**
 * The font files in a zip (a Google Fonts download is one). Only the central
 * directory is trusted, every declared size is capped before anything is
 * inflated, and encrypted or exotic entries are skipped rather than guessed at.
 */
export async function fontsInZip(zip: Uint8Array): Promise<ZipEntry[]> {
  const v = view(zip)
  let eocd = -1
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (v.getUint32(i, true) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new FontFileError('the zip is damaged')
  const total = v.getUint16(eocd + 10, true)
  let at = v.getUint32(eocd + 16, true)

  const out: ZipEntry[] = []
  for (let i = 0; i < total; i++) {
    if (at + 46 > zip.length || v.getUint32(at, true) !== 0x02014b50) throw new FontFileError('the zip is damaged')
    const flags = v.getUint16(at + 8, true)
    const method = v.getUint16(at + 10, true)
    const compSize = v.getUint32(at + 20, true)
    const size = v.getUint32(at + 24, true)
    const nameLength = v.getUint16(at + 28, true)
    const next = at + 46 + nameLength + v.getUint16(at + 30, true) + v.getUint16(at + 32, true)
    const local = v.getUint32(at + 42, true)
    const name = new TextDecoder().decode(zip.subarray(at + 46, at + 46 + nameLength))
    at = next

    const base = name.replace(/^.*\//, '')
    const usable =
      (FONT_EXTENSIONS as readonly string[]).includes(extensionOf(base)) &&
      !name.startsWith('__MACOSX/') &&
      !base.startsWith('.') &&
      (flags & 1) === 0 &&
      (method === 0 || method === 8) &&
      size <= MAX_FONT_BYTES
    if (!usable) continue
    if (local + 30 > zip.length || v.getUint32(local, true) !== 0x04034b50) throw new FontFileError('the zip is damaged')
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    if (start + compSize > zip.length) throw new FontFileError('the zip is damaged')
    const data = zip.subarray(start, start + compSize)
    out.push({ name, bytes: method === 0 ? data : await inflate(data, 'deflate-raw', size) })
  }
  return out
}

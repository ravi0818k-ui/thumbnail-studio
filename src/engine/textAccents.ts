import type { TextAccent } from '../types'

// ---------------------------------------------------------------------------
// Coloured words inside one text layer — "Companies want a *Full Stack
// Developer*" with the last three words green. An accent is a character range
// of `text`, not a marker typed into it, so the canvas editor shows plain text
// and wrapping is free to break a coloured phrase across lines.
//
// Everything here is pure and runs in the selftest.
// ---------------------------------------------------------------------------

/** How many accent colours one layer offers in the panel. Ref: news cards use one, quote cards two. */
export const ACCENT_SWATCHES = ['#22c55e', '#facc15', '#ef4444', '#38bdf8', '#a3e635', '#fb923c']

/**
 * Sorted, clamped, trimmed, non-overlapping, non-empty — and two runs of one colour
 * separated only by spaces become one, since a space has no colour to show and
 * one run is what the creator meant when they painted a phrase word by word.
 */
export function cleanAccents(accents: TextAccent[], text: string): TextAccent[] {
  const length = text.length
  const sorted = accents
    .map((a) => {
      let start = Math.max(0, Math.min(length, a.start))
      let end = Math.max(0, Math.min(length, a.end))
      // Spaces at either end carry no colour; trimming them keeps one shape for one meaning.
      while (start < end && /\s/.test(text[start])) start++
      while (end > start && /\s/.test(text[end - 1])) end--
      return { start, end, color: a.color }
    })
    .filter((a) => a.end > a.start)
    .sort((a, b) => a.start - b.start)
  const out: TextAccent[] = []
  for (const a of sorted) {
    const last = out[out.length - 1]
    if (last && a.start < last.end) {
      // Overlap: the later run wins its own range.
      if (a.end <= last.end && a.color === last.color) continue
      last.end = a.start
      if (last.end <= last.start) out.pop()
    }
    const prev = out[out.length - 1]
    if (prev && prev.color === a.color && /^\s*$/.test(text.slice(prev.end, a.start))) {
      prev.end = Math.max(prev.end, a.end)
      continue
    }
    out.push({ ...a })
  }
  return out
}

/** Paints [start, end) one colour, or clears it when `color` is null. */
export function paintAccent(accents: TextAccent[], text: string, start: number, end: number, color: string | null): TextAccent[] {
  if (end <= start) return cleanAccents(accents, text)
  const kept: TextAccent[] = []
  for (const a of accents) {
    if (a.end <= start || a.start >= end) kept.push(a)
    else {
      if (a.start < start) kept.push({ ...a, end: start })
      if (a.end > end) kept.push({ ...a, start: end })
    }
  }
  if (color) kept.push({ start, end, color })
  return cleanAccents(kept, text)
}

export interface Word {
  start: number
  end: number
  word: string
}

/** The words of the text, with their offsets — what the panel's word chips are made from. */
export function wordsOf(text: string): Word[] {
  const words: Word[] = []
  for (const m of text.matchAll(/\S+/g)) words.push({ start: m.index!, end: m.index! + m[0].length, word: m[0] })
  return words
}

/** The accent colour at one character, or null. */
export function accentAt(accents: TextAccent[], index: number): string | null {
  for (const a of accents) if (index >= a.start && index < a.end) return a.color
  return null
}

/** Clicking a word: paint it, or clear it when it already wears that colour. */
export function toggleWord(accents: TextAccent[], text: string, word: Word, color: string): TextAccent[] {
  const covered = accents.some((a) => a.color === color && a.start <= word.start && a.end >= word.end)
  return paintAccent(accents, text, word.start, word.end, covered ? null : color)
}

/**
 * Keeps accents on their words across an edit. The edit is found as the
 * common prefix and suffix of the two strings — exactly what a keystroke, a
 * paste or a deletion produces — and every offset after it shifts. Typing
 * inside a coloured word extends its colour; typing just after it does not.
 */
export function remapAccents(before: string, after: string, accents: TextAccent[]): TextAccent[] {
  if (accents.length === 0 || before === after) return accents
  const limit = Math.min(before.length, after.length)
  let prefix = 0
  while (prefix < limit && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < limit - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const oldEnd = before.length - suffix
  const newEnd = after.length - suffix
  const delta = after.length - before.length
  const map = (x: number, isEnd: boolean) => {
    if (x <= prefix) return x
    if (x >= oldEnd) return x + delta
    return isEnd ? newEnd : prefix
  }
  return cleanAccents(
    accents.map((a) => ({ ...a, start: map(a.start, false), end: map(a.end, true) })),
    after,
  )
}

/**
 * For each character of the displayed text, the index of the source character
 * it came from. Uppercasing can lengthen a string ("ß" → "SS"), and the layout
 * works on the displayed string while accents are offsets into the source.
 */
export function displayMap(text: string, uppercase: boolean): { display: string; source: number[] } {
  const display = uppercase ? text.toUpperCase() : text
  if (display.length === text.length) return { display, source: Array.from({ length: text.length }, (_, i) => i) }
  const source: number[] = []
  let built = ''
  let index = 0
  for (const ch of text) {
    const up = ch.toUpperCase()
    for (let k = 0; k < up.length; k++) source.push(index)
    built += up
    index += ch.length
  }
  // A context-sensitive mapping the per-character pass did not reproduce: colour nothing rather than the wrong letters.
  if (built !== display) return { display, source: Array.from({ length: display.length }, () => -1) }
  return { display, source }
}

export interface ColorRun {
  text: string
  color: string
}

/** One laid-out line split into runs of one colour each. */
export function lineRuns(line: string, start: number, source: number[], accents: TextAccent[], base: string): ColorRun[] {
  const runs: ColorRun[] = []
  for (let i = 0; i < line.length; i++) {
    const src = source[start + i] ?? -1
    const color = (src >= 0 ? accentAt(accents, src) : null) ?? base
    const last = runs[runs.length - 1]
    if (last && last.color === color) last.text += line[i]
    else runs.push({ text: line[i], color })
  }
  return runs
}
